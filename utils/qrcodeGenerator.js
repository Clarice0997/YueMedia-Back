// import modules
const QRCode = require('qrcode')

// QrCode Option
let opts = {
  errorCorrectionLevel: 'H',
  type: 'image/jpeg',
  quality: 0.3,
  margin: 1
}

// 生成二维码函数
const generateQrcode = async (content, option = opts) => {
  return new Promise(async (resolve, reject) => {
    try {
      const qrcode = await QRCode.toDataURL(content, option)
      resolve(qrcode)
    } catch (error) {
      reject(error)
    }
  })
}

module.exports = { generateQrcode }
