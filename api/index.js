const axios = require('axios');
const md5 = require('md5');

// --- 你的 SESSDATA ---
const SESSDATA = "67f236f2%2C1778895861%2Cc47f5%2Ab1CjA8BxQ8sBT2cDATzxP4tzrOKku-c4EADJiZoxTPiefa3GEwr-JWKle-W8cagt99DEkSVl9nZVo4cUo3Ty1TSm94bFBSaDdIMEU5R2NNVEdGVTZMYXFhNHZEbVdyNnY5YTI5TGc3ZW1Sa1ZnRVdjZ3htNEw3MVZMLXQ3YUF6QlhVckx0S2pwZU1BIIEC";

// TV端 AppKey 和 Secret
const APP_KEY = '4409e2ce8ffd12b8';
const APP_SEC = '59b43e9d97fa1bb44463c50ce187ea2c';

// 签名算法
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
    const cookie = `SESSDATA=${SESSDATA}`;
    
    // 1. 获取 CID (复用 Web 接口)
    const cidRes = await axios.get(`https://api.bilibili.com/x/player/pagelist?bvid=${bvid}`);
    if (cidRes.data.code !== 0) {
        throw new Error("CID 获取失败");
    }
    const cid = cidRes.data.data[0].cid;

    // 2. 构造 TV 端请求参数
    // 接口: /x/tv/ugc/playurl
    const params = {
      appkey: APP_KEY,
      bvid: bvid,
      cid: cid,
      qn: 112,       // 试图请求 1080P+ (TV版通常用 112/80)
      fnval: 16,     // DASH 格式
      fnver: 0,
      fourk: 1,
      platform: 'android',
      mobi_app: 'android_tv', // 关键伪装
      build: 102801,
      ts: Math.round(Date.now() / 1000)
    };

    params.sign = getSign(params);

    // 构造 Query
    const queryStr = Object.keys(params).map(k => `${k}=${params[k]}`).join('&');

    // 3. 请求 TV 接口
    const finalUrl = `https://api.bilibili.com/x/tv/ugc/playurl?${queryStr}`;
    
    const playResp = await axios.get(finalUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 BiliDroid/1.0 (bbcallen@gmail.com)",
        "Cookie": cookie
      }
    });

    // 4. 返回数据
    // 注意：TV 接口返回的数据结构可能略有不同，但依然包含 durl 或 dash
    res.status(200).json(playResp.data);

  } catch (error) {
    console.error(error);
    res.status(500).json({ code: 500, message: error.message });
  }
};
