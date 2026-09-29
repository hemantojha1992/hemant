const redis = require("redis");
let redisClient;

// (async () => {
//   redisClient = redis.createClient();
//   redisClient.on("error", (error) => console.error(`Error : ${error}`));
//   await redisClient.connect();
// })();
async function setCacheData(key, value, expiry = false) {
  try {
    let args = [key, JSON.stringify(value)];
    if (expiry !== false) {
      args.push({ EX: expiry });
    }
    const result = await redisClient.set(...args);
    return result;
  } catch (error) {
    throw error;
  }
}

async function getCacheData(key) {
  try {
    const result = await redisClient.get(key);
    if (!result) return false;

    try {
      return JSON.parse(result);
    } catch {
      return result; // if string returns as-is
    }
  } catch (error) {
    throw error;
  }
}
async function delCacheData(key) {
  try {
    const result = await redisClient.del(key);
    if (result === null) {
      return false;
    }
    return result;
  } catch (error) {
    throw error;
  }
}

module.exports = { setCacheData, getCacheData, delCacheData }