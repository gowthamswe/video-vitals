"use client";

import { useState, useEffect } from "react";

interface UserInfo {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

export default function Home() {
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const result = await chrome.storage.local.get(['vv_user', 'vv_signed_in']);
      if (result.vv_signed_in && result.vv_user) {
        setIsSignedIn(true);
        setUser(result.vv_user);
      } else {
        setIsSignedIn(false);
        setUser(null);
      }
    } catch (e) {
      console.log('Auth check error:', e);
    }
    setIsLoading(false);
  };

  const handleSignIn = async () => {
    setError(null);
    try {
      // Get OAuth token using chrome.identity
      const token = await new Promise<string>((resolve, reject) => {
        chrome.identity.getAuthToken({ interactive: true }, (token) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError.message);
          } else if (token) {
            resolve(token);
          } else {
            reject('No token received');
          }
        });
      });

      // Get user info from Google
      const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.ok) {
        throw new Error('Failed to get user info');
      }

      const userInfo = await response.json();
      const userData: UserInfo = {
        id: userInfo.id,
        email: userInfo.email,
        name: userInfo.name,
        picture: userInfo.picture
      };

      // Save to storage
      await chrome.storage.local.set({
        vv_user: userData,
        vv_user_id: userData.id,
        vv_signed_in: true
      });

      setIsSignedIn(true);
      setUser(userData);
      console.log('Signed in:', userData);
    } catch (e: any) {
      console.log('Sign in error:', e);
      setError(e.toString());
    }
  };

  const handleSignOut = async () => {
    try {
      // Revoke the token
      chrome.identity.getAuthToken({ interactive: false }, (token) => {
        if (token) {
          chrome.identity.removeCachedAuthToken({ token }, () => {
            console.log('Token removed');
          });
        }
      });

      // Clear storage
      await chrome.storage.local.set({
        vv_user: null,
        vv_user_id: null,
        vv_signed_in: false
      });

      setIsSignedIn(false);
      setUser(null);
    } catch (e) {
      console.log('Sign out error:', e);
    }
  };

  if (isLoading) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <span style={styles.logo}>🎬 VideoVitals</span>
        </div>
        <div style={styles.content}>
          <p style={styles.text}>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.logo}>🎬 VideoVitals</span>
      </div>

      <div style={styles.content}>
        {isSignedIn && user ? (
          <>
            <div style={styles.userBox}>
              {user.picture && (
                <img src={user.picture} alt="" style={styles.avatar} />
              )}
              <div style={styles.userInfo}>
                <span style={styles.userName}>{user.name}</span>
                <span style={styles.userEmail}>{user.email}</span>
              </div>
            </div>
            <p style={styles.infoText}>
              Go to a YouTube video to rate it for clickbait and information density.
            </p>
            <button style={styles.signOutButton} onClick={handleSignOut}>
              Sign Out
            </button>
          </>
        ) : (
          <>
            <p style={styles.text}>
              Sign in with Google to rate YouTube videos and help the community identify clickbait.
            </p>
            {error && (
              <p style={styles.errorText}>{error}</p>
            )}
            <button style={styles.signInButton} onClick={handleSignIn}>
              <img
                src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                alt=""
                style={styles.googleIcon}
              />
              Sign in with Google
            </button>
          </>
        )}
      </div>

      <div style={styles.footer}>
        <p style={styles.footerText}>Rate videos. Help everyone.</p>
      </div>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    width: '320px',
    fontFamily: 'Arial, sans-serif',
    backgroundColor: '#fff',
  },
  header: {
    padding: '16px',
    background: 'linear-gradient(135deg, #ff6b35 0%, #f7931e 100%)',
    color: 'white',
  },
  logo: {
    fontSize: '18px',
    fontWeight: 'bold',
  },
  content: {
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  text: {
    margin: 0,
    fontSize: '14px',
    color: '#666',
    lineHeight: '1.5',
  },
  infoText: {
    margin: 0,
    fontSize: '13px',
    color: '#666',
    lineHeight: '1.5',
  },
  errorText: {
    margin: 0,
    fontSize: '12px',
    color: '#d32f2f',
    lineHeight: '1.4',
  },
  userBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px',
    backgroundColor: '#f5f5f5',
    borderRadius: '8px',
  },
  avatar: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
  },
  userInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  userName: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#333',
  },
  userEmail: {
    fontSize: '12px',
    color: '#666',
  },
  signInButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    padding: '12px 20px',
    backgroundColor: '#fff',
    color: '#333',
    border: '1px solid #ddd',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  googleIcon: {
    width: '18px',
    height: '18px',
  },
  signOutButton: {
    padding: '10px 16px',
    backgroundColor: '#f5f5f5',
    color: '#666',
    border: '1px solid #ddd',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  footer: {
    padding: '12px 16px',
    borderTop: '1px solid #eee',
    textAlign: 'center',
  },
  footerText: {
    margin: 0,
    fontSize: '11px',
    color: '#999',
  },
};
