import { useEffect, useRef } from 'react'

/**
 * 文章正文容器：渲染服务端消毒过的 HTML，并在客户端增强代码块（复制按钮）。
 * 增强只操作 DOM、不参与 hydration，因此 SSR/CSR 输出一致（无闪烁风险）。
 */
export function PostBody({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const container = ref.current
    if (!container) return
    for (const pre of Array.from(container.querySelectorAll('pre'))) {
      if (pre.dataset.enhanced === '1') continue
      pre.dataset.enhanced = '1'
      pre.classList.add('code-block')

      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'code-copy-btn'
      button.textContent = '复制'
      button.addEventListener('click', () => {
        const code = pre.querySelector('code')?.textContent ?? pre.textContent ?? ''
        void navigator.clipboard.writeText(code).then(() => {
          button.textContent = '已复制'
          window.setTimeout(() => {
            button.textContent = '复制'
          }, 1500)
        })
      })
      pre.appendChild(button)
    }
  }, [html])

  return (
    <div
      ref={ref}
      className="prose prose-zinc dark:prose-invert max-w-none"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
