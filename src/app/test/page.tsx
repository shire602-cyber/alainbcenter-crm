/**
 * Simple test page to verify the app is working
 * Access at: http://localhost:3000/test
 */
export default function TestPage() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui' }}>
      <h1>✅ Server is Working!</h1>
      <p>If you can see this page, the Next.js server is running correctly.</p>
      <p>Time: {new Date().toISOString()}</p>
      <a href="/login" style={{ color: 'blue', textDecoration: 'underline' }}>
        Go to Login Page
      </a>
    </div>
  )
}











