"use client"

// ============================================================
// Firebase Authentication — sisi client
// ------------------------------------------------------------
// File ini membaca konfigurasi dari variabel environment
// NEXT_PUBLIC_FIREBASE_* (lihat file .env).
//
// Jika variabel tersebut masih kosong, aplikasi otomatis
// berjalan dalam "Mode Demo": semua fitur CSV & database tetap
// berfungsi, hanya fitur login yang nonaktif.
// ============================================================

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app"
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type Auth,
  type User,
} from "firebase/auth"
import type { AuthUserInfo } from "@/types/csv"

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
}

/** true jika semua nilai Firebase wajib sudah diisi di .env */
export function isFirebaseConfigured(): boolean {
  return Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.authDomain &&
      firebaseConfig.projectId &&
      firebaseConfig.appId
  )
}

/** Ambil instance Firebase App (null saat mode demo) */
function getFirebaseApp(): FirebaseApp | null {
  if (!isFirebaseConfigured()) return null
  return getApps().length > 0 ? getApp() : initializeApp(firebaseConfig)
}

/** Ambil instance Firebase Auth (null saat mode demo) */
function getFirebaseAuth(): Auth | null {
  const app = getFirebaseApp()
  if (!app) return null
  return getAuth(app)
}

function toUserInfo(user: User): AuthUserInfo {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName ?? user.email?.split("@")[0] ?? null,
  }
}

/** Login dengan email + password */
export async function signInWithEmail(
  email: string,
  password: string
): Promise<AuthUserInfo> {
  const auth = getFirebaseAuth()
  if (!auth) throw new Error("Firebase belum dikonfigurasi (mode demo).")
  const cred = await signInWithEmailAndPassword(auth, email, password)
  return toUserInfo(cred.user)
}

/** Daftar akun baru dengan email + password */
export async function registerWithEmail(
  email: string,
  password: string,
  displayName?: string
): Promise<AuthUserInfo> {
  const auth = getFirebaseAuth()
  if (!auth) throw new Error("Firebase belum dikonfigurasi (mode demo).")
  const cred = await createUserWithEmailAndPassword(auth, email, password)
  if (displayName && displayName.trim() !== "") {
    await updateProfile(cred.user, { displayName: displayName.trim() })
  }
  return toUserInfo(cred.user)
}

/** Login dengan akun Google (popup) */
export async function signInWithGoogle(): Promise<AuthUserInfo> {
  const auth = getFirebaseAuth()
  if (!auth) throw new Error("Firebase belum dikonfigurasi (mode demo).")
  const provider = new GoogleAuthProvider()
  const cred = await signInWithPopup(auth, provider)
  return toUserInfo(cred.user)
}

/** Keluar dari akun */
export async function logout(): Promise<void> {
  const auth = getFirebaseAuth()
  if (!auth) return
  await signOut(auth)
}

/**
 * Berlangganan perubahan status login.
 * Mengembalikan fungsi unsubscribe.
 * Saat mode demo: langsung memanggil callback dengan null.
 */
export function subscribeToAuth(
  callback: (user: AuthUserInfo | null) => void
): () => void {
  const auth = getFirebaseAuth()
  if (!auth) {
    callback(null)
    return () => {}
  }
  return onAuthStateChanged(auth, (user) => {
    callback(user ? toUserInfo(user) : null)
  })
}

/** Terjemahkan error Firebase Auth ke pesan Bahasa Indonesia */
export function describeFirebaseError(error: unknown): string {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : ""
  switch (code) {
    case "auth/invalid-email":
      return "Format email tidak valid."
    case "auth/user-not-found":
      return "Akun dengan email ini tidak ditemukan."
    case "auth/wrong-password":
      return "Password salah."
    case "auth/invalid-credential":
      return "Email atau password salah."
    case "auth/email-already-in-use":
      return "Email sudah terdaftar, silakan masuk."
    case "auth/weak-password":
      return "Password terlalu lemah (minimal 6 karakter)."
    case "auth/too-many-requests":
      return "Terlalu banyak percobaan. Coba lagi beberapa saat."
    case "auth/popup-closed-by-user":
      return "Jendela login Google ditutup sebelum selesai."
    case "auth/operation-not-allowed":
      return "Metode login ini belum diaktifkan di Firebase Console."
    case "auth/unauthorized-domain":
      return "Domain ini belum didaftarkan di Firebase Console (Authentication > Settings > Authorized domains)."
    default:
      if (error instanceof Error) return error.message
      return "Terjadi kesalahan yang tidak diketahui."
  }
}
