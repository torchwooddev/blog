import { useTheme } from 'next-themes'
import { Moon, Sun } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '#/components/ui/tooltip'

/**
 * 明暗切换（light → dark → system 三态循环）。
 * 首帧渲染用固定图标避免主题闪烁；激活后按 next-themes 的 resolvedTheme 渲染。
 */
export function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme()

  const cycle = () => {
    if (resolvedTheme === 'dark') setTheme('light')
    else setTheme('dark')
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="切换明暗主题"
          onClick={cycle}
          className="relative text-muted-foreground hover:text-foreground"
        >
          <Sun className="size-[1.1rem] scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
          <Moon className="absolute size-[1.1rem] scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>切换明暗主题</TooltipContent>
    </Tooltip>
  )
}
