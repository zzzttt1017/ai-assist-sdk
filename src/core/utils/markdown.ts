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
