// import modules
const { auth } = require('../middlewares/Auth')
const router = require('express').Router()
const fs = require('fs')
const { errorHandler, downloadErrorHandler } = require('../middlewares/ErrorCatcher')
const { downloadService, playMusicService, downloadPatchService, playVideoService } = require('../services/DownloadService')
const { PlayMusicRecord } = require('../models/playMusicRecordModel')
const { PlayVideoRecord } = require('../models/playVideoRecordModel')

/**
 * @api {GET} /apis/download 下载文件接口
 * @apiName Download
 * @apiGroup Download
 * @apiName Download/Download
 * @apiPermission User
 * @apiHeader {String} Authorization JWT鉴权
 * @apiParam {String} downloadPath 下载地址
 * @apiParam {String} [downloadType] 下载类型
 */
router.get('/', auth, async (req, res) => {
  try {
    // 获取下载地址
    const { downloadPath, downloadType } = req.query
    // Service
    const { filename, mimetype, downloadRecord, concatDownloadPath, code, data } = await downloadService(downloadPath, downloadType, req)
    // 错误返回
    if (code === 500) return res.status(code).send({ ...data, code })
    // 设置响应头
    res.header('Access-Control-Expose-Headers', 'Content-Disposition')
    res.header('Content-Disposition', 'attachment; filename=' + encodeURIComponent(filename))
    res.header('Content-Type', mimetype)
    // 文件读取流 管道传输 监听传输完毕事件&传输失败事件 更新文件下载记录
    const filestream = fs.createReadStream(concatDownloadPath)
    try {
      filestream.pipe(res).on('finish', async () => {
        downloadRecord.status = 1
        downloadRecord.downloadEndTime = new Date()
        downloadRecord.downloadDuration = downloadRecord.downloadEndTime - downloadRecord.downloadStartTime
        await downloadRecord.save()
      })
    } catch (error) {
      // 断开传输流
      filestream.close()
      downloadRecord.status = 2
      await downloadRecord.save()
      await downloadErrorHandler(error, req.ip)
    }
  } catch (error) {
    await errorHandler(error, req, res)
  }
})

/**
 * @api {GET} /apis/download/music 音频播放接口
 * @apiName PlayMusic
 * @apiGroup Download
 * @apiName Download/PlayMusic
 * @apiPermission User
 * @apiHeader {String} Authorization JWT鉴权
 * @apiParam {String} playMusicPath 音频地址
 */
router.get('/music', auth, async (req, res) => {
  try {
    // 获取播放音频文件地址
    const { playMusicPath } = req.query
    // 获取播放范围
    let range = req.headers['range']
    // Service
    const { mimetype, filePath, code, data } = await playMusicService(playMusicPath)
    // 错误返回
    if (code === 500) return res.status(code).send({ ...data, code })

    // 判断是否初次请求
    if (range) {
      let stats = await fs.statSync(filePath)
      let r = range.match(/=(\d+)-(\d+)?/)
      let start = parseInt(r[1], 10)
      let end = r[2] ? parseInt(r[2], 10) : start + 1024 * 1024
      if (end > stats.size - 1) end = stats.size - 1
      let header = {
        'Content-Type': `${mimetype}`,
        'Content-Range': `bytes ${start}-${end}/${stats.size}`,
        'Content-Length': end - start + 1,
        'Accept-Ranges': 'bytes'
      }
      res.writeHead(206, header)
      fs.createReadStream(filePath, { start: start, end: end }).pipe(res)
    } else {
      // 音频播放记录
      const playMusicRecord = new PlayMusicRecord({
        userId: req.authorization.uno,
        ip: req.ip,
        musicPath: playMusicPath,
        fileSize: fs.statSync(filePath).size,
        downloadStartTime: new Date()
      })
      await playMusicRecord.save()
      let stats = await fs.statSync(filePath)
      let header = {
        'Content-Type': `${mimetype}`,
        'Content-Length': stats.size,
        'Accept-Ranges': 'bytes'
      }
      res.writeHead(200, header)
      fs.createReadStream(filePath).pipe(res)
    }
  } catch (error) {
    await errorHandler(error, req, res)
  }
})

/**
 * @api {GET} /apis/download/video 视频播放接口
 * @apiName PlayVideo
 * @apiGroup Download
 * @apiName Download/PlayVideo
 * @apiPermission User
 * @apiHeader {String} Authorization JWT鉴权
 * @apiParam {String} playVideoPath 视频地址
 */
router.get('/video', auth, async (req, res) => {
  try {
    // 获取播放视频文件地址
    const { playVideoPath } = req.query
    // Service
    const { mimetype, filePath, code, data } = await playVideoService(playVideoPath)
    // 错误返回
    if (code === 500) return res.status(code).send({ ...data, code })

    // 获取播放范围
    let range = req.headers['range']

    if (range) {
      let stats = await fs.statSync(filePath)
      let r = range.match(/=(\d+)-(\d+)?/)
      let start = parseInt(r[1], 10)
      let end = r[2] ? parseInt(r[2], 10) : start + 1024 * 1024
      if (end > stats.size - 1) end = stats.size - 1
      let header = {
        'Content-Type': `${mimetype}`,
        'Content-Range': `bytes ${start}-${end}/${stats.size}`,
        'Content-Length': end - start + 1,
        'Accept-Ranges': 'bytes'
      }
      res.writeHead(206, header)
      fs.createReadStream(filePath, { start: start, end: end }).pipe(res)
    } else {
      // 视频播放记录
      const playVideoRecord = new PlayVideoRecord({
        userId: req.authorization.uno,
        ip: req.ip,
        videoPath: playVideoPath,
        fileSize: fs.statSync(filePath).size,
        downloadStartTime: new Date()
      })
      await playVideoRecord.save()
      let stats = await fs.statSync(filePath)
      let header = {
        'Content-Type': `${mimetype}`,
        'Content-Length': stats.size,
        'Accept-Ranges': 'bytes'
      }
      res.writeHead(200, header)
      fs.createReadStream(filePath)
    }
  } catch (error) {
    await errorHandler(error, req, res)
  }
})

/**
 * @api {GET} /apis/download/patch 下载处理任务压缩包接口
 * @apiName DownloadPatch
 * @apiGroup Download
 * @apiName Download/DownloadPatch
 * @apiPermission User
 * @apiHeader {String} Authorization JWT鉴权
 * @apiParam {String} downloadPath 下载地址
 * @apiParam {String} [downloadType] 下载类型
 */
router.get('/patch', auth, async (req, res) => {
  try {
    // 获取下载地址
    const { downloadPath, downloadType } = req.query
    // Service
    const { filename, mimetype, downloadRecord, concatDownloadPath, code, data } = await downloadPatchService(downloadPath, downloadType, req)
    // 错误返回
    if (code === 500) return res.status(code).send({ ...data, code })
    // 设置响应头
    res.header('Access-Control-Expose-Headers', 'Content-Disposition')
    res.header('Content-Disposition', 'attachment; filename=' + encodeURIComponent(filename))
    res.header('Content-Type', mimetype)
    // 文件读取流 管道传输 监听传输完毕事件&传输失败事件 更新文件下载记录
    const filestream = fs.createReadStream(concatDownloadPath)
    try {
      filestream.pipe(res).on('finish', async () => {
        downloadRecord.status = 1
        downloadRecord.downloadEndTime = new Date()
        downloadRecord.downloadDuration = downloadRecord.downloadEndTime - downloadRecord.downloadStartTime
        await downloadRecord.save()
      })
    } catch (error) {
      // 断开传输流
      filestream.close()
      downloadRecord.status = 2
      await downloadRecord.save()
      await downloadErrorHandler(error, req.ip)
    }
  } catch (error) {
    await errorHandler(error, req, res)
  }
})

module.exports = router
