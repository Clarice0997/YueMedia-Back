// import modules
const { hashSync, compareSync } = require('bcrypt')
const { mysqlHandler } = require('../config/mysql')
const { v4: uuidv4 } = require('uuid')
const { generateJsonWebToken, decryptJsonWebToken } = require('../utils/Jwt')
const { loginRecord } = require('../models/loginRecordModel')
const { ServiceErrorHandler } = require('../middlewares/ErrorCatcher')
const { calculateLoginRecords } = require('../utils/redis/calculator/calculateLoginRecords')
const { hsetRedis, hgetRedis } = require('../utils/redis/RedisHandler')
const { calculateUserUsedStorage } = require('../utils/redis/calculator/calculateUserUsedStorage')
const { calculateUserStorage } = require('../utils/redis/calculator/calculateUserStorage')

/**
 * 登录 Service
 * @param {*} username
 * @param {*} password
 * @param {*} ip
 * @returns
 */
async function loginService(username, password, ip) {
  try {
    // 判断参数是否存在
    if (!username || !password) {
      return {
        code: 400,
        data: {
          message: '请求参数不完整！'
        }
      }
    }
    // 获取 MySQL 用户信息，判断用户是否存在
    // 防止暴力破解
    const user = await mysqlHandler(`select * from users where username = ?`, [username])
    if (user.length === 0) {
      return {
        code: 400,
        data: {
          message: '账号密码错误！'
        }
      }
    }
    // IP 锁定
    if (+(await hgetRedis('login_ip_limit_lock', ip)) >= +process.env.LoginIpLimitTime) {
      return {
        code: 400,
        data: {
          message: 'IP已锁定！'
        }
      }
    }
    // 账号锁定
    if (+(await hgetRedis('login_limit_lock', username)) >= +process.env.LoginLimitTime) {
      return {
        code: 400,
        data: {
          message: '登录已锁定！'
        }
      }
    }
    if (user[0].status === 2 || user[0].del_flag === 2) {
      return {
        code: 400,
        data: {
          message: '账号异常！'
        }
      }
    }
    // 用户存在则比对密码是否相同
    let flag = compareSync(password, user[0].password)
    if (flag) {
      let token = await generateJsonWebToken({
        uno: user[0].uno,
        username: user[0].username,
        nickname: user[0].nickname,
        status: user[0].status,
        type: user[0].type
      })
      let RefreshToken = await generateJsonWebToken(
        {
          uno: user[0].uno,
          username: user[0].username,
          nickname: user[0].nickname,
          status: user[0].status,
          type: user[0].type
        },
        process.env.Refresh_key,
        '7d'
      )
      await loginRecord(user[0].uno, user[0].username, ip)
      calculateLoginRecords()
      return {
        code: 200,
        data: {
          message: '登录成功！',
          token,
          RefreshToken
        }
      }
    } else {
      // IP 锁定
      const loginIpTimes = await hgetRedis('login_ip_limit_lock', ip)
      if (loginIpTimes) {
        await hsetRedis('login_ip_limit_lock', ip, +loginIpTimes + 1, process.env.LoginIpLimit)
      } else {
        await hsetRedis('login_ip_limit_lock', ip, 1, process.env.LoginIpLimit)
      }
      // 登录账号锁定
      const loginTimes = await hgetRedis('login_limit_lock', username)
      if (loginTimes) {
        await hsetRedis('login_limit_lock', username, +loginTimes + 1, process.env.LoginLimit)
      } else {
        await hsetRedis('login_limit_lock', username, 1, process.env.LoginLimit)
      }
      return {
        code: 400,
        data: {
          message: '账号密码错误！'
        }
      }
    }
  } catch (error) {
    ServiceErrorHandler(error)
    return {
      code: 500,
      data: {
        message: error.message
      }
    }
  }
}

/**
 * 注册 Service
 * @param {*} param0
 * @param ip
 * @returns
 */
async function registerService({ username, password, nickname, phone, email }, ip) {
  try {
    // 判断参数是否存在
    if (!(username && password && nickname && phone && email)) {
      return {
        code: 400,
        data: {
          message: '请求参数不完整！'
        }
      }
    }

    // IP 锁定
    if (+(await hgetRedis('register_ip_limit_lock', ip)) >= +process.env.RegisterIpLimitTime) {
      return {
        code: 400,
        data: {
          message: '注册已锁定，请稍后重试！'
        }
      }
    }

    // 判断用户是否已被注册
    if ((await mysqlHandler(`select * from users where username = ?`, [username])).length !== 0) {
      // IP 锁定
      const registerIpTimes = await hgetRedis('register_ip_limit_lock', ip)
      if (registerIpTimes) {
        await hsetRedis('register_ip_limit_lock', ip, +registerIpTimes + 1, process.env.RegisterIpLimit)
      } else {
        await hsetRedis('register_ip_limit_lock', ip, 1, process.env.RegisterIpLimit)
      }
      return {
        code: 409,
        data: {
          message: '用户已被注册！'
        }
      }
    }

    // 注册新用户，新增用户数据
    const uno = await uuidv4()
    const query = 'insert into users(uno,username,password,nickname,phone,email) values(?,?,?,?,?,?)'
    const params = [uno, username, await hashSync(password, 10), nickname, phone, email]
    await mysqlHandler(query, params)

    await calculateUserUsedStorage(uno)
    await calculateUserStorage(uno)

    // 成功注册返回
    return {
      code: 200,
      data: { message: '注册成功！' }
    }
  } catch (error) {
    ServiceErrorHandler(error)
    return {
      code: 500,
      data: {
        message: error.message
      }
    }
  }
}

/**
 * 修改用户信息 Service
 * @param userData
 * @param uno
 * @returns
 */
const updateUserDataService = async (userData, uno) => {
  try {
    // 判断参数是否存在
    if (!userData) {
      return {
        code: 400,
        data: {
          message: '参数不合法！'
        }
      }
    }
    // 如果存在电话 判断电话是否已被使用
    if (userData.phone) {
      if ((await mysqlHandler(`select * from users where phone = ?`, [userData.phone])).length !== 0) {
        return {
          code: 409,
          data: {
            message: '电话已被使用！'
          }
        }
      }
    }
    // 如果存在邮箱 判断邮箱是否已被使用
    if (userData.email) {
      if ((await mysqlHandler(`select * from users where email = ?`, [userData.email])).length !== 0) {
        return {
          code: 409,
          data: {
            message: '邮箱已被使用！'
          }
        }
      }
    }
    // 修改用户信息
    await mysqlHandler('update users set nickname = ?, phone = ?,email = ? where uno = ?', [userData.nickname, userData.phone, userData.email, uno])

    return {
      code: 200,
      data: {
        message: '修改用户信息成功！'
      }
    }
  } catch (error) {
    ServiceErrorHandler(error)
    return {
      code: 500,
      data: {
        message: error.message
      }
    }
  }
}

/**
 * 修改用户密码 Service
 * @param password
 * @param newPassword
 * @param uno
 * @returns
 */
const updateUserPasswordService = async (password, newPassword, uno) => {
  try {
    // 判断参数是否存在
    if (!(password && newPassword)) {
      return {
        code: 400,
        data: {
          message: '参数不合法！'
        }
      }
    }
    // 判断原密码是否匹配
    const user = await mysqlHandler(`select * from users where uno = ?`, [uno])
    if (!compareSync(password, user[0].password)) {
      return {
        code: 400,
        data: {
          message: '密码错误！'
        }
      }
    }
    // 修改密码
    await mysqlHandler('update users set password = ? where uno = ?', [await hashSync(newPassword, 10), uno])

    return {
      code: 200,
      data: {
        message: '修改密码成功！'
      }
    }
  } catch (error) {
    ServiceErrorHandler(error)
    return {
      code: 500,
      data: {
        message: error.message
      }
    }
  }
}

/**
 * 占用手机校验 Service
 * @param phone
 * @returns
 */
const verifyPhoneService = async phone => {
  try {
    // 数据合法性校验
    if (!phone) {
      return {
        code: 400,
        data: {
          message: '参数不合法！'
        }
      }
    }
    // 判断电话是否已被使用
    if ((await mysqlHandler(`select * from users where phone = ?`, [phone])).length !== 0) {
      return {
        code: 409,
        data: {
          message: '电话已被使用'
        }
      }
    }

    return {
      code: 200,
      data: {
        message: '电话可用！'
      }
    }
  } catch (error) {
    ServiceErrorHandler(error)
    return {
      code: 500,
      data: {
        message: error.message
      }
    }
  }
}

/**
 * 占用邮箱校验 Service
 * @param email
 * @returns
 */
const verifyEmailService = async email => {
  try {
    // 数据合法性校验
    if (!email) {
      return {
        code: 400,
        data: {
          message: '参数不合法！'
        }
      }
    }

    // 判断邮箱是否已被使用
    if ((await mysqlHandler(`select * from users where email = ?`, [email])).length !== 0) {
      return {
        code: 409,
        data: {
          message: '邮箱已被使用'
        }
      }
    }

    return {
      code: 200,
      data: {
        message: '邮箱可用！'
      }
    }
  } catch (error) {
    ServiceErrorHandler(error)
    return {
      code: 500,
      data: {
        message: error.message
      }
    }
  }
}

/**
 * 无感刷新 Service
 * @param refreshToken
 * @returns
 */
const refreshTokenService = async refreshToken => {
  try {
    // 如果不存在 Refresh Token 则返回错误
    if (!refreshToken)
      return {
        code: 400,
        data: {
          message: '无感刷新失效'
        }
      }
    // 校验 Refresh Token 是否可用
    const userData = await decryptJsonWebToken(refreshToken, process.env.Refresh_key)
    // 生成新的 AccessToken 和 FreshToken
    const AccessToken = await generateJsonWebToken({
      uno: userData.uno,
      username: userData.username,
      nickname: userData.nickname,
      status: userData.status,
      type: userData.type
    })
    const newFreshToken = await generateJsonWebToken(
      {
        uno: userData.uno,
        username: userData.username,
        nickname: userData.nickname,
        status: userData.status,
        type: userData.type
      },
      process.env.Refresh_key,
      '7d'
    )
    // 返回刷新 Token 数据
    return {
      code: 200,
      data: {
        RefreshToken: newFreshToken,
        AccessToken,
        message: '无感刷新成功'
      }
    }
  } catch (error) {
    // 校验失败错误处理
    if (error.name === 'JsonWebTokenError' && error.message === 'invalid token') {
      return {
        code: 400,
        data: {
          message: '无感刷新失效'
        }
      }
    }
    // 通用错误处理函数
    ServiceErrorHandler(error)
    return {
      code: 500,
      data: {
        message: error.message
      }
    }
  }
}

module.exports = { loginService, registerService, updateUserDataService, updateUserPasswordService, verifyPhoneService, verifyEmailService, refreshTokenService }
