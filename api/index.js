const axios = require('axios');
const md5 = require('md5');

// B站 Wbi 签名算法表
const mixinKeyEncTab = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
  33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
  61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
  36, 20, 34, 44, 52
];

// 获取 Mixin Key
const getMixinKey = (orig) => mixinKeyEncTab.map(n => orig[n]).join('').slice(0, 32);

// Wbi 签名计算函数
function encWbi(params, img_key, sub_key) {
  const mixin_key = getMixinKey(img_key + sub_key),
    curr_time = Math.round(Date.now() / 1000),
    chr_filter = /[!'()*]/g;

  // 必须加 wts 时间戳
  Object.assign(params, { wts: curr_time }); 
  
  // 参数排序并拼接
  const query = Object
    .keys(params)
    .sort()
    .map(key => {
      const value = params[key].toString().replace(chr_filter, '');
      return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
    })
    .join('&');
    
  const wbi_sign = md5(query + mixin_key);
  return query + '&w_rid=' + wbi_sign;
}

// 获取 B 站最新的加密 Key
async function getWbiKeys(cookie) {
  try {
    const { data } = await axios.get('https://api.bilibili.com/x/web-interface/nav', {
      headers: { 
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Cookie": cookie 
      }
    });
    
    const img_url = data.data.wbi_img.img_url;
    const sub_url = data.data.wbi_img.sub_url;
    
    return {
      img_key: img_url.substring(img_url.lastIndexOf('/') + 1, img_url.lastIndexOf('.')),
      sub_key: sub_url.substring(sub_url.lastIndexOf('/') + 1, sub_url.lastIndexOf('.'))
    };
  } catch (e) {
    console.error("获取 Key 失败:", e.message);
    throw e;
  }
}

// Vercel 云函数入口
module.exports = async (req, res) => {
  const { bvid } = req.query;
  const SESSDATA = process.env.SESSDATA || "";

  if (!bvid) {
    return res.status(400).json({ code: -1, message: "缺少 bvid 参数" });
  }

  try {
    // 1. 组装 Cookie
    const cookie = `SESSDATA=${SESSDATA}`;
    const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    // 2. 获取 Wbi Key
    const { img_key, sub_key } = await getWbiKeys(cookie);

    // 3. 获取 CID (视频 ID)
    const cidRes = await axios.get(`https://api.bilibili.com/x/player/pagelist?bvid=${bvid}`, {
       headers: { "User-Agent": userAgent, "Cookie": cookie }
    });
    
    if (cidRes.data.code !== 0) {
        throw new Error(`CID 获取失败: ${cidRes.data.message}`);
    }
    const cid = cidRes.data.data[0].cid;

    // 4. 准备参数
    const params = {
      bvid: bvid,
      cid: cid,
      qn: 80,      // 80 = 1080P
      fnval: 16,   // 16 = DASH 格式 (虽然我们只想要 URL，但这个参数能确保返回丰富数据)
      fnver: 0,
      fourk: 1     // 允许 4K
    };
    
    // 5. 计算签名
    const query = encWbi(params, img_key, sub_key);

    // 6. 请求最终视频流
    const finalUrl = `https://api.bilibili.com/x/player/wbi/playurl?${query}`;
    const playResp = await axios.get(finalUrl, {
      headers: {
        "User-Agent": userAgent,
        "Cookie": cookie,
        "Referer": "https://www.bilibili.com/"
      }
    });

    // 7. 返回数据给 Cloudflare
    res.status(200).json(playResp.data);

  } catch (error) {
    console.error(error);
    res.status(500).json({ code: 500, message: error.message });
  }
};
