'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Flame, Loader2, Mail } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

const magicLinkSchema = z.object({
  email: z.string().email('Invalid email'),
})

type LoginForm = z.infer<typeof loginSchema>
type MagicLinkForm = z.infer<typeof magicLinkSchema>

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const [magicSent, setMagicSent] = useState(false)

  const loginForm = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  })

  const magicForm = useForm<MagicLinkForm>({
    resolver: zodResolver(magicLinkSchema),
  })

  async function onLogin(data: LoginForm) {
    const { error } = await supabase.auth.signInWithPassword(data)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Signed in!')
    router.push('/dashboard')
    router.refresh()
  }

  async function onMagicLink(data: MagicLinkForm) {
    const { error } = await supabase.auth.signInWithOtp({
      email: data.email,
      options: { emailRedirectTo: `${window.location.origin}/dashboard` },
    })
    if (error) {
      toast.error(error.message)
      return
    }
    setMagicSent(true)
    toast.success('Magic link sent! Check your email.')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-950/20 dark:to-orange-950/20 p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Brand */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <Flame className="h-10 w-10 text-red-600" />
            <span className="font-bold text-3xl tracking-tight">SPika CRM</span>
          </div>
          <p className="text-muted-foreground text-sm">
            Sales & Delivery Management
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Sign In</CardTitle>
            <CardDescription>
              Use your credentials or a magic link
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="password">
              <TabsList className="w-full mb-4">
                <TabsTrigger value="password" className="flex-1">
                  Password
                </TabsTrigger>
                <TabsTrigger value="magic" className="flex-1">
                  Magic Link
                </TabsTrigger>
              </TabsList>

              {/* Password login */}
              <TabsContent value="password">
                <form
                  onSubmit={loginForm.handleSubmit(onLogin)}
                  className="space-y-4"
                >
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@spika.com"
                      {...loginForm.register('email')}
                    />
                    {loginForm.formState.errors.email && (
                      <p className="text-xs text-destructive">
                        {loginForm.formState.errors.email.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      {...loginForm.register('password')}
                    />
                    {loginForm.formState.errors.password && (
                      <p className="text-xs text-destructive">
                        {loginForm.formState.errors.password.message}
                      </p>
                    )}
                  </div>
                  <Button
                    type="submit"
                    className="w-full bg-red-600 hover:bg-red-700"
                    disabled={loginForm.formState.isSubmitting}
                  >
                    {loginForm.formState.isSubmitting && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    Sign In
                  </Button>
                </form>
              </TabsContent>

              {/* Magic link */}
              <TabsContent value="magic">
                {magicSent ? (
                  <div className="text-center py-6 space-y-2">
                    <Mail className="h-10 w-10 text-red-600 mx-auto" />
                    <p className="font-medium">Check your inbox!</p>
                    <p className="text-sm text-muted-foreground">
                      We sent a magic link to your email.
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setMagicSent(false)}
                    >
                      Send again
                    </Button>
                  </div>
                ) : (
                  <form
                    onSubmit={magicForm.handleSubmit(onMagicLink)}
                    className="space-y-4"
                  >
                    <div className="space-y-1.5">
                      <Label htmlFor="magic-email">Email</Label>
                      <Input
                        id="magic-email"
                        type="email"
                        placeholder="you@spika.com"
                        {...magicForm.register('email')}
                      />
                      {magicForm.formState.errors.email && (
                        <p className="text-xs text-destructive">
                          {magicForm.formState.errors.email.message}
                        </p>
                      )}
                    </div>
                    <Button
                      type="submit"
                      className="w-full bg-red-600 hover:bg-red-700"
                      disabled={magicForm.formState.isSubmitting}
                    >
                      {magicForm.formState.isSubmitting && (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      )}
                      Send Magic Link
                    </Button>
                  </form>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
