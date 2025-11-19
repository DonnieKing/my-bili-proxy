const axios = require('axios');
const md5 = require('md5');

// --- 你的 SESSDATA (保持不变) ---
const SESSDATA = "67f236f2%2C1778895861%2Cc47f5%2Ab1CjA8BxQ8sBT2cDATzxP4tzrOKku-c4EADJiZoxTPiefa3GEwr-JWKle-W8cagt99DEkSVl9nZVo4cUo3Ty1TSm94bFBSaDdIMEU5R2NNVEdGVTZMYXFhNHZEbVdyNnY5YTI5TGc3ZW1Sa1ZnRVdjZ3htNEw3MVZMLXQ3YUF6QlhVckx0S2pwZU1BIIEC";

// 安卓端 AppKey 和 Secret (B站官方客户端 Key)
const APP_KEY = 'iVGUTjsxvpLeuDCf';
const APP_SEC = 'aHRmhWMLkdeMuILqORnYZocwMBpMEOdt';

// App 签名算法
function getSign(params) {
  let items = Object.keys(params).sort();
  let result = [];
  for (let key of items) {
    result.push(`${key}=${params[key]}`);
  }
  let str = result.join('&');
  return md5(str + APP_SEC);
}

module.exports = async (req, res) => {
  const { bvid } = req.query;

  if (!bvid) {
    return res.status(400).json({ code: -1, message: "No bvid" });
  }

  try {
    // 1. 准备 App 专用 Cookie (只需要 SESSDATA)
    const cookie = `SESSDATA=${SESSDATA}`;
    
    // 2. 获取 CID (这一步用 Web 接口没关系，只是拿个 ID)
    const cidRes = await axios.get(`https://api.bilibili.com/x/player/pagelist?bvid=${bvid}`);
    const cid = cidRes.data.data[0].cid;

    // 3. 构造安卓端请求参数
    // 关键点：platform=android, fnval=1 (强制请求 MP4, 不用 DASH)
    const params = {
      appkey: APP_KEY,
      bvid: bvid,
      cid: cid,
      qn: 80,        // 试图请求 1080P
      fnval: 1,      // 1 = MP4格式 (iOS友好), 16 = DASH
      fnver: 0,
      fourk: 1,      // 允许 4K
      platform: 'android',
      mobi_app: 'android',
      build: 7060000, // 伪装成高版本客户端
      ts: Math.round(Date.now() / 1000)
    };

    // 计算签名
    params.sign = getSign(params);

    // 构造查询字符串
    const queryStr = Object.keys(params).map(k => `${k}=${params[k]}`).join('&');

    // 4. 请求 App 播放接口
    const finalUrl = `https://app.bilibili.com/x/v2/playurl?${queryStr}`;
    
    const playResp = await axios.get(finalUrl, {
      headers: {
        "User-Agent": "Bilibili Freedoooooom/MarkII", // 安卓客户端 UA
        "Cookie": cookie
      }
    });

    // 5. 返回结果
    res.status(200).json(playResp.data);

  } catch (error) {
    console.error(error);
    res.status(500).json({ code: 500, message: error.message });
  }
};
