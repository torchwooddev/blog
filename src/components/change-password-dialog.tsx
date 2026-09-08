import { useMutation } from '@tanstack/react-query'
import { KeyRound } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '#/components/ui/dialog'
import { PasswordInput } from '#/components/password-input'
import { Label } from '#/components/ui/label'
import { describeError, errorStatus } from '#/lib/errors'
import { changePassword } from '#/lib/torchwood-client'

/**
 * 自助修改密码：走 Client 账号 API（服务端校验旧密码）。任何登录用户可用——
 * 入口在公开页账号菜单（受控模式）与工作台侧栏（自持触发器）。
 */
export function ChangePasswordDialog({
  children,
  open,
  onOpenChange,
}: {
  /** 自持触发器（按钮等）；受控使用时省略。 */
  children?: ReactNode
  /** 受控模式：由外部（如下拉菜单）控制开关。 */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const isOpen = open ?? uncontrolledOpen
  const setOpen = (next: boolean) => {
    setUncontrolledOpen(next)
    onOpenChange?.(next)
  }
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const localError =
    confirmPassword && newPassword !== confirmPassword ? '两次输入的新密码不一致。' : null

  const mutation = useMutation({
    mutationFn: () => changePassword(oldPassword, newPassword),
    onSuccess: () => {
      toast.success('密码已修改，下次登录请使用新密码。')
      setOpen(false)
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
    },
    // 这里 401 的唯一业务含义是旧密码不对（token 已先经 ensureFreshAccessToken 刷新）。
    onError: (e: unknown) =>
      toast.error(errorStatus(e) === 401 ? '旧密码不正确。' : describeError(e)),
  })

  const canSubmit =
    oldPassword.length > 0 && newPassword.length >= 8 && newPassword === confirmPassword && !mutation.isPending

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setOldPassword('')
          setNewPassword('')
          setConfirmPassword('')
        }
      }}
    >
      {children ? <DialogTrigger asChild>{children}</DialogTrigger> : null}
      <DialogContent className="sm:max-w-sm">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (canSubmit) mutation.mutate()
          }}
        >
          <DialogHeader>
            <DialogTitle>修改密码</DialogTitle>
            <DialogDescription>验证当前密码后设置新密码，修改立即生效。</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="change-pw-old">当前密码</Label>
            <PasswordInput
              id="change-pw-old"
              value={oldPassword}
              onChange={setOldPassword}
              autoComplete="current-password"
              placeholder="输入当前密码"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="change-pw-new">新密码</Label>
            <PasswordInput
              id="change-pw-new"
              value={newPassword}
              onChange={setNewPassword}
              autoComplete="new-password"
              placeholder="至少 8 位"
              minLength={8}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="change-pw-confirm">确认新密码</Label>
            <PasswordInput
              id="change-pw-confirm"
              value={confirmPassword}
              onChange={setConfirmPassword}
              autoComplete="new-password"
              placeholder="再输入一次新密码"
              required
            />
            {localError ? <p className="text-xs text-destructive">{localError}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {mutation.isPending ? <KeyRound className="size-4 animate-pulse" /> : <KeyRound className="size-4" />}
              {mutation.isPending ? '提交中…' : '修改密码'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
