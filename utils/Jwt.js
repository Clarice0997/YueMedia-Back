// import modules
const jwt = require('jsonwebtoken')

/**
 * 生成 JWT （默认生成 Access Token）
 * @param payload
 * @param key
 * @param maxAge
 * @returns
 */
const generateJsonWebToken = async (payload, key = process.env.JWT_key, maxAge = '60m') => {
  return new Promise((resolve, reject) => {
    jwt.sign(payload, key, { expiresIn: maxAge }, (err, token) => {
      if (err) reject(err)
      resolve(token)
    })
  })
}

/**
 * 解密 JWT
 * @param token
 * @param key
 * @returns
 */
const decryptJsonWebToken = async (token, key) => {
  return jwt.verify(token, key)
}

module.exports = { generateJsonWebToken, decryptJsonWebToken }
