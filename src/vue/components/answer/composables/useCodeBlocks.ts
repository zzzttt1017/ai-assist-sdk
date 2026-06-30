/**
 * 代码块增强：为 markdown 渲染出的 <pre> 添加语言标签和复制按钮
 */
export function useCodeBlocks() {
  function enhanceCodeBlocks(container: HTMLElement) {
    const pres = container.querySelectorAll('pre')
    pres.forEach((pre) => {
      // 避免重复增强
      if (pre.querySelector('.copy-button')) return
      const code = pre.querySelector('code')
      if (!code) return

      // 提取语言
      const langClass = Array.from(code.classList).find(c => c.startsWith('language-')) || ''
      const language = langClass.replace('language-', '')
      if (language) {
        const langSpan = document.createElement('span')
        langSpan.className = 'code-lang'
        langSpan.textContent = language
        pre.appendChild(langSpan)
      }

      // 添加复制按钮
      const btn = document.createElement('button')
      btn.className = 'copy-button'
      btn.textContent = '复制'
      btn.onclick = () => {
        navigator.clipboard.writeText(code.textContent || '').then(() => {
          btn.textContent = '已复制'
          setTimeout(() => { btn.textContent = '复制' }, 2000)
        })
      }
      pre.appendChild(btn)
    })
  }

  return { enhanceCodeBlocks }
}
