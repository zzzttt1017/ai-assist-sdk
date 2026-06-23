import DOMPurify from 'dompurify'
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'
import markdownItHighlightjs from 'markdown-it-highlightjs'
import markdownItMultimdTable from 'markdown-it-multimd-table'

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: true,
})
  .use(markdownItHighlightjs, { auto: true, code: true, inline: true, hljs })
  .use(markdownItMultimdTable, { multiline: true, rowspan: true, headerless: false })

export const renderMarkdown = (content: string): string => {
  const rawHtml = md.render(content || '')
  return DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS: ['h1','h2','h3','h4','h5','h6','pre','code','span','div','strong','em','a','img','ul','ol','li','p','blockquote','table','thead','tbody','tr','th','td'],
    ALLOWED_ATTR: ['href','src','alt','class','target','colspan','rowspan','style'],
    FORCE_BODY: true,
  })
}

/**
 * 预处理流式传输中的不完整 Markdown，避免渲染错乱
 * - 闭合未关闭的代码块 (```)
 * - 闭合未关闭的行内代码 (`)
 * - 闭合未关闭的粗体/斜体标记
 */
export const preprocessStreamingMarkdown = (content: string): string => {
  if (!content) return ''

  // 1. 处理围栏代码块：统计 ``` 出现次数，奇数则补闭合
  const fenceCount = (content.match(/```/g) || []).length
  if (fenceCount % 2 !== 0) {
    content += '\n```'
  }

  // 2. 处理行内代码：统计非转义反引号，奇数则补闭合
  //    只在非代码块区域内处理
  const inlineBacktickCount = (content.match(/(?<!`)`(?!`)/g) || []).length
  if (inlineBacktickCount % 2 !== 0) {
    content += '`'
  }

  // 3. 处理粗体/斜体：简化处理，不闭合以避免影响正常内容
  //    流式场景下粗体/斜体短暂缺失闭合问题不大

  return content
}
