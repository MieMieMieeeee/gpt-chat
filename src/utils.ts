import { arrayBufferToBase64, Context, Dict, Logger, Quester } from 'koishi'
import { ImageData } from './types'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif']
const MAX_CONTENT_SIZE = 10485760

const logger = new Logger('gpt-chat')

export async function download(ctx: Context, url: string, headers = {}): Promise<ImageData> {
  if (url.startsWith('data:') || url.startsWith('file:')) {
    const { mime, data } = await ctx.http.file(url)
    if (!ALLOWED_TYPES.includes(mime)) {
      throw new NetworkError('.unsupported-file-type')
    }
    const base64 = arrayBufferToBase64(data)
    return { buffer: data, base64, dataUrl: `data:${mime};base64,${base64}` }
  } else {
    const head = await ctx.http.head(url, { headers })
    if (+head.get('content-length') > MAX_CONTENT_SIZE) {
      throw new NetworkError('.file-too-large')
    }
    const mimetype = head.get('content-type')
    // logger.debug(head)
    if (!ALLOWED_TYPES.includes(mimetype)) {
      throw new NetworkError('.unsupported-file-type')
    }
    const buffer = await ctx.http.get(url, { responseType: 'arraybuffer', headers })
    const base64 = arrayBufferToBase64(buffer)
    return { buffer, base64, dataUrl: `data:${mimetype};base64,${base64}` }
  }
}

export class NetworkError extends Error {
    constructor(message: string, public params = {}) {
      super(message)
    }
  
    static catch = (mapping: Dict<string>) => (e: any) => {
      if (Quester.Error.is(e)) {
        const code = e.response?.status
        for (const key in mapping) {
          if (code === +key) {
            throw new NetworkError(mapping[key])
          }
        }
      }
      throw e
    }
  }
