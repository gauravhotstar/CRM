"use client"

import { useState, useEffect } from "react"
import { notFound } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Smartphone, Camera, MapPin, Users, Bell, Wifi, Download, Maximize, Vibrate, Sun } from "lucide-react"
import { SplashScreen } from "@/components/pwa/splash-screen"
import { FullscreenManager } from "@/components/pwa/fullscreen-manager"
import { AppThemeManager } from "@/components/pwa/app-theme-manager"
import { useHapticFeedback } from "@/components/pwa/native-interactions"
import { CameraCapture } from "@/components/device/camera-capture"
import { LocationPicker } from "@/components/device/location-picker"
import { ContactPicker } from "@/components/device/contact-picker"
import { pushManager } from "@/lib/notifications/push"
import { cameraManager } from "@/lib/device/camera"
import { locationManager } from "@/lib/device/location"
import { contactManager } from "@/lib/device/contacts"
import { toast } from "sonner"

export default function PWADemoPage() {
  if (process.env.NODE_ENV === "production") {
    notFound()
  }
  const [showSplash, setShowSplash] = useState(false)
  const [showCamera, setShowCamera] = useState(false)
  const [showLocation, setShowLocation] = useState(false)
  const [showContacts, setShowContacts] = useState(false)
  const [capabilities, setCapabilities] = useState({
    push: false,
    camera: false,
    location: false,
    contacts: false,
    haptic: false,
  })

  useEffect(() => {
    // This effect runs only on the client-side after the component mounts
    async function checkCapabilities() {
      if (typeof window !== "undefined") {
        setCapabilities({
          push: await pushManager.isAvailable(),
          camera: await cameraManager.isAvailable(),
          location: await locationManager.isAvailable(),
          contacts: await contactManager.isAvailable(),
          haptic: "vibrate" in navigator,
        })
      }
    }
    checkCapabilities()
  }, [])

  const haptic = useHapticFeedback()

  const features = [
    {
      icon: <Download className="h-5 w-5" />,
      title: "App Installation",
      description: "Install directly from browser",
      status: "Available", // This is handled by the browser's native prompt
      action: () => {
        haptic.lightImpact()
        toast.info("Use the install prompt that appears at the bottom of the screen")
      },
    },
    {
      icon: <Wifi className="h-5 w-5" />,
      title: "Offline Support",
      description: "Works without internet",
      status: "Active",
      action: () => {
        haptic.lightImpact()
        toast.info("Try disconnecting your internet - the app will still work!")
      },
    },
    {
      icon: <Bell className="h-5 w-5" />,
      title: "Push Notifications",
      description: "Stay updated with alerts",
      status: capabilities.push ? "Available" : "Not Supported",
      action: async () => {
        haptic.mediumImpact()
        if (!capabilities.push) {
          toast.error("Push notifications are not supported on this device.")
          return
        }
        try {
          const permission = await pushManager.requestPermission()
          if (permission === "granted") {
            await pushManager.subscribe()
            toast.success("Push notifications enabled!")
          } else {
            toast.error("Push notifications denied")
          }
        } catch (error) {
          toast.error("Failed to enable notifications")
        }
      },
    },
    {
      icon: <Camera className="h-5 w-5" />,
      title: "Camera Access",
      description: "Take photos for leads",
      status: capabilities.camera ? "Available" : "Not Supported",
      action: () => {
        haptic.lightImpact()
        if (capabilities.camera) {
          setShowCamera(true)
        } else {
          toast.error("Camera access is not supported on this device.")
        }
      },
    },
    {
      icon: <MapPin className="h-5 w-5" />,
      title: "Location Services",
      description: "Get GPS coordinates",
      status: capabilities.location ? "Available" : "Not Supported",
      action: () => {
        haptic.lightImpact()
        if (capabilities.location) {
          setShowLocation(true)
        } else {
          toast.error("Location services are not supported on this device.")
        }
      },
    },
    {
      icon: <Users className="h-5 w-5" />,
      title: "Contact Access",
      description: "Import device contacts",
      status: capabilities.contacts ? "Available" : "Not Supported",
      action: () => {
        haptic.lightImpact()
        if (capabilities.contacts) {
          setShowContacts(true)
        } else {
          toast.error("Contact access is not supported on this device.")
        }
      },
    },
    {
      icon: <Maximize className="h-5 w-5" />,
      title: "Fullscreen Mode",
      description: "Immersive app experience",
      status: "Available",
      action: () => {
        haptic.lightImpact()
        toast.info("Use the fullscreen button in the top navigation")
      },
    },
    {
      icon: <Vibrate className="h-5 w-5" />,
      title: "Haptic Feedback",
      description: "Touch vibration responses",
      status: capabilities.haptic ? "Available" : "Not Supported",
      action: () => {
        if (capabilities.haptic) {
          haptic.success()
          toast.success("Haptic feedback activated!")
        } else {
          toast.error("Haptic feedback is not supported on this device.")
        }
      },
    },
  ]

  return (
    <>
      {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} />}

      {showCamera && (
        <CameraCapture
          onCapture={(image) => {
            setShowCamera(false)
            toast.success("Photo captured successfully!")
          }}
          onCancel={() => setShowCamera(false)}
        />
      )}

      {/* Location and Contact Pickers are also wrapped in client-side checks */}
      {showLocation && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md">
            <LocationPicker
              onLocationSelect={(location) => {
                setShowLocation(false)
                toast.success(`Location: ${location.latitude}, ${location.longitude}`)
              }}
            />
            <Button variant="outline" onClick={() => setShowLocation(false)} className="w-full mt-4 bg-transparent">
              Cancel
            </Button>
          </div>
        </div>
      )}

      {showContacts && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md">
            <ContactPicker
              onContactSelect={(contact) => {
                setShowContacts(false)
                toast.success(`Contact selected: ${contact.name?.[0] || "Unknown"}`)
              }}
            />
            <Button variant="outline" onClick={() => setShowContacts(false)} className="w-full mt-4 bg-transparent">
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="min-h-screen bg-background p-4 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">PWA Features Demo</h1>
            <p className="text-muted-foreground">Test all Progressive Web App capabilities</p>
          </div>
          <div className="flex items-center gap-2">
            <AppThemeManager />
            <FullscreenManager />
          </div>
        </div>

        {/* Demo Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5" />
              Quick Actions
            </CardTitle>
            <CardDescription>Test core PWA functionality</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              onClick={() => setShowSplash(true)}
              variant="outline"
              className="w-full justify-start bg-transparent"
            >
              <Sun className="h-4 w-4 mr-2" />
              Show Splash Screen
            </Button>

            <Button onClick={() => haptic.success()} variant="outline" className="w-full justify-start bg-transparent">
              <Vibrate className="h-4 w-4 mr-2" />
              Test Haptic Feedback
            </Button>
          </CardContent>
        </Card>

        {/* Feature Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, index) => (
            <Card key={index} className="cursor-pointer hover:shadow-md transition-shadow" onClick={feature.action}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    {feature.icon}
                    <CardTitle className="text-base">{feature.title}</CardTitle>
                  </div>
                  <Badge
                    variant={feature.status === "Available" || feature.status === "Active" ? "default" : "secondary"}
                    className="text-xs"
                  >
                    {feature.status}
                  </Badge>
                </div>
                <CardDescription>{feature.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    </>
  )
}
