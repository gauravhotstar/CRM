// app/debug/page.tsx
import { notFound } from "next/navigation"
import TestPage from "./test-page"

export default function DebugPage() {
  if (process.env.NODE_ENV === "production") {
    notFound()
  }

  return <TestPage />
}