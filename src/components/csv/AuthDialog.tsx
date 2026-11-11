"use client"

// ============================================================
// AuthDialog — dialog login Firebase Authentication
// Mode 1: Firebase aktif  → form login / daftar / Google
// Mode 2: Mode demo       → panduan konfigurasi Firebase
// ============================================================

import * as React from "react"
import { ExternalLink, KeyRound, Loader2, LogOut, Mail } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  describeFirebaseError,
  isFirebaseConfigured,
  logout,
  registerWithEmail,
  signInWithEmail,
  signInWithGoogle,
} from "@/lib/firebase"
import type { AuthUserInfo } from "@/types/csv"

interface AuthDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: AuthUserInfo | null
  onUserChange: (user: AuthUserInfo | null) => void
}

const ENV_VARS = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
]

export function AuthDialog({ open, onOpenChange, user, onUserChange }: AuthDialogProps) {
  const { toast } = useToast()
  const configured = React.useMemo(() => isFirebaseConfigured(), [])
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [displayName, setDisplayName] = React.useState("")
  const [loadingAction, setLoadingAction] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) {
      setError(null)
      setPassword("")
    }
  }, [open])

  const withLoading = async (action: string, fn: () => Promise<void>) => {
    setLoadingAction(action)
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(describeFirebaseError(err))
    } finally {
      setLoadingAction(null)
    }
  }

  const handleLogin = () =>
    withLoading("login", async () => {
      if (!email.trim() || !password) throw new Error("Isi email dan password terlebih dahulu.")
      const info = await signInWithEmail(email.trim(), password)
      onUserChange(info)
      toast({ title: "Berhasil masuk", description: `Selamat datang, ${info.displayName ?? info.email}!` })
      onOpenChange(false)
    })

  const handleRegister = () =>
    withLoading("register", async () => {
      if (!email.trim() || !password) throw new Error("Isi email dan password terlebih dahulu.")
      if (password.length < 6) throw new Error("Password minimal 6 karakter.")
      const info = await registerWithEmail(email.trim(), password, displayName)
      onUserChange(info)
      toast({
        title: "Akun berhasil dibuat",
        description: `Selamat datang, ${info.displayName ?? info.email}!`,
      })
      onOpenChange(false)
    })

  const handleGoogle = () =>
    withLoading("google", async () => {
      const info = await signInWithGoogle()
      onUserChange(info)
      toast({ title: "Berhasil masuk", description: `Selamat datang, ${info.displayName ?? info.email}!` })
      onOpenChange(false)
    })

  const handleLogout = () =>
    withLoading("logout", async () => {
      await logout()
      onUserChange(null)
      toast({ title: "Berhasil keluar", description: "Sampai jumpa lagi!" })
      onOpenChange(false)
    })

  // ---------- Mode profil (sudah login) ----------
  if (user) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Akun Anda</DialogTitle>
            <DialogDescription>Terhubung melalui Firebase Authentication.</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-3 rounded-lg border p-4">
            <Avatar className="h-12 w-12">
              <AvatarFallback className="bg-emerald-100 font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                {(user.displayName ?? user.email ?? "?").charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate font-semibold">{user.displayName ?? "Pengguna"}</p>
              <p className="truncate text-sm text-muted-foreground">{user.email ?? "tanpa email"}</p>
            </div>
          </div>
          <Button variant="outline" className="h-11 gap-2" onClick={handleLogout} disabled={loadingAction !== null}>
            {loadingAction === "logout" ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <LogOut className="h-4 w-4" aria-hidden="true" />
            )}
            Keluar
          </Button>
        </DialogContent>
      </Dialog>
    )
  }

  // ---------- Mode demo (Firebase belum dikonfigurasi) ----------
  if (!configured) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Login (Firebase belum dikonfigurasi)</DialogTitle>
            <DialogDescription>
              Aplikasi saat ini berjalan dalam{" "}
              <span className="font-medium text-foreground">Mode Demo</span> — semua
              fitur CSV dan database tetap berfungsi, hanya fitur login yang
              nonaktif. Aktifkan Firebase di komputer Anda dengan langkah berikut:
            </DialogDescription>
          </DialogHeader>
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li>
              Buat project gratis di{" "}
              <a
                href="https://console.firebase.google.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-emerald-600 hover:underline"
              >
                console.firebase.google.com
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            </li>
            <li>
              Menu <span className="font-medium">Authentication</span> → Sign-in
              method → aktifkan <span className="font-medium">Email/Password</span> dan{" "}
              <span className="font-medium">Google</span>
            </li>
            <li>
              Project Settings → Your apps → buat <span className="font-medium">Web app</span>{" "}
              → salin <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">firebaseConfig</code>
            </li>
            <li>
              Isi nilai berikut di file{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">.env</code> lalu
              jalankan ulang aplikasi:
              <div className="mt-2 space-y-1 rounded-md bg-muted p-3 font-mono text-xs">
                {ENV_VARS.map((v) => (
                  <div key={v}>{v}="…nilai dari firebaseConfig…"</div>
                ))}
              </div>
            </li>
          </ol>
        </DialogContent>
      </Dialog>
    )
  }

  // ---------- Mode login (Firebase aktif) ----------
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Masuk ke akun</DialogTitle>
          <DialogDescription>
            Login melalui Firebase Authentication untuk menandai dataset milik Anda.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="login">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login">Masuk</TabsTrigger>
            <TabsTrigger value="register">Daftar</TabsTrigger>
          </TabsList>

          <TabsContent value="login" className="space-y-4 pt-4">
            <div className="grid gap-2">
              <Label htmlFor="login-email">Email</Label>
              <Input
                id="login-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@contoh.com"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="login-password">Password</Label>
              <Input
                id="login-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                onKeyDown={(e) => e.key === "Enter" && void handleLogin()}
              />
            </div>
            <Button
              className="h-11 w-full gap-2"
              onClick={handleLogin}
              disabled={loadingAction !== null}
            >
              {loadingAction === "login" ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <KeyRound className="h-4 w-4" aria-hidden="true" />
              )}
              Masuk
            </Button>
          </TabsContent>

          <TabsContent value="register" className="space-y-4 pt-4">
            <div className="grid gap-2">
              <Label htmlFor="reg-name">Nama (opsional)</Label>
              <Input
                id="reg-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Nama lengkap"
                autoComplete="name"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="reg-email">Email</Label>
              <Input
                id="reg-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@contoh.com"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="reg-password">Password (min. 6 karakter)</Label>
              <Input
                id="reg-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                onKeyDown={(e) => e.key === "Enter" && void handleRegister()}
              />
            </div>
            <Button
              className="h-11 w-full gap-2"
              onClick={handleRegister}
              disabled={loadingAction !== null}
            >
              {loadingAction === "register" ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Mail className="h-4 w-4" aria-hidden="true" />
              )}
              Buat Akun
            </Button>
          </TabsContent>
        </Tabs>

        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">atau</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <Button
          variant="outline"
          className="h-11 w-full gap-2"
          onClick={handleGoogle}
          disabled={loadingAction !== null}
        >
          {loadingAction === "google" ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
          )}
          Lanjutkan dengan Google
        </Button>

        {error && (
          <Alert variant="destructive">
            <AlertTitle>Login gagal</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </DialogContent>
    </Dialog>
  )
}
