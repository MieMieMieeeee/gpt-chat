import { Context, Schema,h,SessionError,Logger } from 'koishi'
import { OpenAI} from 'openai'
import { ImageData} from './types'
import { download,  NetworkError} from './utils'

export const name = 'gpt-chat'

const logger = new Logger('gpt-chat')

export interface Config {
  apiKey: string
  textModel: string
  imageModel: string
  systemContent: string
}

export const Config: Schema<Config> = Schema.object({
  apiKey: Schema.string().description('OpenAI API 密钥').required().role('secret'),
  textModel: Schema.string().description('OpenAI 模型名称，用于纯文本').default('gpt-3.5-turbo'), 
  imageModel: Schema.string().description('OpenAI 模型名称，用于识图').default('gpt-4o'), 
  systemContent: Schema.string().description('系统提示词').default('你叫Mie宝。用中文回答,不要回复任何关于色情暴力政治的话题。通常情况下，回复字数控制在100字左右。'),
})

export function apply(ctx: Context, config: Config) {
  const openai = new OpenAI({
    apiKey: config.apiKey,
  })

  ctx.command('gpt <message:text>')
    // .alias('chatgpt')
    .action(async ({ session }, message) => {
      if (!message) return session.text('请输入您想与 GPT 聊天的内容。')
      let imgUrl: string, image: ImageData
      let targetModel = config.textModel
      logger.debug('h.parse:', h.parse(message))
      message = h('', h.transform(h.parse(message), {
        img(attrs) {
          if (imgUrl) throw new SessionError('.too-many-images')
          imgUrl = attrs.src || attrs.url
          return ''
        },
      })).toString(true)
      logger.debug(imgUrl)
      if (imgUrl) {
        try {
          image = await retryDownload(ctx, imgUrl, 5, 20000)
        } catch (err) {
          if (err instanceof NetworkError) {
            return session.text(err.message, err.params)
          }
          logger.error(err)
          return session.text('.download-error')
        }
        logger.debug(image.dataUrl)
      }
      

      const userMessages:Array<OpenAI.ChatCompletionContentPart>=[{
        "type": "text",
        "text": message
        }
      ]

      if (image && image.dataUrl) {
        targetModel=config.imageModel
        userMessages.push({
          "type": "image_url",
          "image_url": {
            "url": image.dataUrl
          }
        });
      }
      
      const messages:Array<OpenAI.ChatCompletionMessageParam>= [
        {
          "role": "system",
          "content": config.systemContent
        },
        {
          "role": "user",
          "content": userMessages
        }
      ];
    
      
      try {
        const chatCompletion = await openai.chat.completions.create({
          messages: messages,
          model: targetModel,
        })

        const reply = chatCompletion.choices[0].message.content.trim()
        return reply
      } catch (error) {
        logger.error('调用 OpenAI API 时出错:', error)
        return '调用 OpenAI API 时出错，请稍后再试。'
      }
    })
}

async function retryDownload(ctx: Context, imgUrl: string, retries: number, delay: number): Promise<ImageData> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await download(ctx, imgUrl)
    } catch (err) {
      if (err instanceof NetworkError) {
        if (attempt < retries) {
          logger.warn(err)
          logger.warn(`图片下载失败，重试第 ${attempt} 次，等待 ${delay} 毫秒...`)
          await new Promise(resolve => setTimeout(resolve, delay))
        } else {
          throw err
        }
      } else {
        throw err
      }
    }
  }
  throw new NetworkError('下载失败，已达到最大重试次数。')
}

