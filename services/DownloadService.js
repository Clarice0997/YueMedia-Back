// import modules
const { ServiceErrorHandler } = require('../middlewares/ErrorCatcher')
const path = require('path')
const mime = require('mime')
const { DownloadRecord } = require('../models/downloadRecordModel')
const fs = require('fs')

/**
 * 下载 Service
 * @param downloadPath
 * @param downloadType
 * @param req
 * @returns
 */
const downloadService = async (downloadPath, downloadType, req) => {
  try {
    // 拼接下载链接
    const concatDownloadPath = path.join(process.env.DEFAULT_STATIC_PATH, process.env.DOWNLOAD_FOLDER, downloadPath)
    // 获取文件名
    const filename = path.basename(concatDownloadPath)
    const mimetype = mime.getType(concatDownloadPath)
    // 文件下载记录
    const downloadRecord = new DownloadRecord({
      userId: req.authorization.uno,
      ip: req.ip,
      downloadPath: downloadPath,
      type: downloadType ? downloadType : 'Normal Download',
      fileSize: fs.statSync(concatDownloadPath).size,
      downloadStartTime: new Date()
    })
    await downloadRecord.save()
    return {
      filename,
      mimetype,
      downloadRecord,
      concatDownloadPath
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
 * 播放音乐 Service
 * @param playMusicPath
 * @returns
 */
const playMusicService = async playMusicPath => {
  try {
    // 拼接音频链接
    const concatMusicPath = path.join(process.env.DEFAULT_STATIC_PATH, playMusicPath)
    // 获取文件名
    const filename = path.basename(concatMusicPath)
    const mimetype = mime.getType(concatMusicPath)
    return {
      filename,
      mimetype,
      filePath: concatMusicPath
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
 * 播放视频 Service
 * @param playVideoPath
 * @returns
 */
const playVideoService = async playVideoPath => {
  try {
    // 拼接视频链接
    const concatMusicPath = path.join(process.env.DEFAULT_STATIC_PATH, playVideoPath)
    // 获取文件名
    const filename = path.basename(concatMusicPath)
    const mimetype = mime.getType(concatMusicPath)

    return {
      filename,
      mimetype,
      filePath: concatMusicPath
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
 * 下载处理任务压缩包 Service
 * @param downloadPath
 * @param downloadType
 * @param req
 * @returns
 */
const downloadPatchService = async (downloadPath, downloadType, req) => {
  try {
    // 拼接下载链接
    const concatDownloadPath = path.join(process.env.DEFAULT_STATIC_PATH, downloadPath)
    // 获取文件名
    const filename = path.basename(concatDownloadPath)
    const mimetype = mime.getType(concatDownloadPath)
    // 文件下载记录
    const downloadRecord = new DownloadRecord({
      userId: req.authorization.uno,
      ip: req.ip,
      downloadPath: downloadPath,
      type: downloadType ? downloadType : 'Patch Download',
      fileSize: fs.statSync(concatDownloadPath).size,
      downloadStartTime: new Date()
    })
    await downloadRecord.save()
    return {
      filename,
      mimetype,
      downloadRecord,
      concatDownloadPath
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

module.exports = { downloadService, playMusicService, playVideoService, downloadPatchService }
