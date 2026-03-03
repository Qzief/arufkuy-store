/**
 * config.js — Konfigurasi Sentral Arufkuy Store
 * 
 * File ini menyimpan semua konfigurasi yang digunakan
 * di berbagai halaman agar tidak duplikat.
 * 
 * Cukup edit file ini jika ada perubahan konfigurasi.
 */

// ==========================================
// Firebase Configuration
// ==========================================
export const firebaseConfig = {
    apiKey: "AIzaSyDtBSbjr5IHmuZqND0MIexw-tWWcZIF33A",
    authDomain: "arufkuy-store.firebaseapp.com",
    projectId: "arufkuy-store",
    storageBucket: "arufkuy-store.firebasestorage.app",
    messagingSenderId: "694416486376",
    appId: "1:694416486376:web:fa36cccffd65557ddc3e5d"
};

// ==========================================
// Firebase SDK Version (untuk konsistensi)
// ==========================================
export const FIREBASE_VERSION = '10.7.1';

// ==========================================
// API URLs
// ==========================================

// Cloudflare Worker base URL (payment gateway proxy)
export const WORKER_BASE_URL = 'https://payment.arufkuy.workers.dev';

// Google Apps Script URL (untuk feedback/review system)
export const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzYGA-rzPSIXOvLftbqCMhXDahn90HViWAqJuXxRTUn7kUYJEPlxot3w7P0JwgFpJdI/exec";
