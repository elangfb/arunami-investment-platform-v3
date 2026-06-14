import { ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { logoutAction } from '@/server/actions/auth'

// Shown to an authenticated user who has no desk grants yet (first login → zero
// access). Lives OUTSIDE the (app) route group, so there is no sidebar/shell.
export default function AwaitingAccessPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-5 px-6 py-10 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <ShieldAlert className="size-7" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-semibold tracking-tight">Akun Anda menunggu akses</h1>
            <p className="text-sm text-muted-foreground">
              Akun Anda berhasil masuk, tetapi belum memiliki hak akses ke meja kerja
              mana pun. Hubungi Superadmin untuk diberikan peran dan akses.
            </p>
          </div>
          <form action={logoutAction}>
            <Button type="submit" variant="outline">
              Keluar
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
