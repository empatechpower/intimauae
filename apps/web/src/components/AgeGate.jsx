import { useEffect, useState } from 'react';

export default function AgeGate() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (localStorage.getItem('intimauae_age_verified') !== 'true') setShow(true);
  }, []);

  if (!show) return null;

  return (
    <div className="age-gate show" id="ageGate">
      <div className="age-card">
        <h2>WELCOME TO INTIMAUAE</h2>
        <p>
          This website contains adult material and is only suitable for those 18 years or older. Click ENTER only if you
          are at least 18 years of age.
        </p>
        <div className="age-actions">
          <button
            type="button"
            className="btn-enter"
            onClick={() => {
              localStorage.setItem('intimauae_age_verified', 'true');
              setShow(false);
            }}
          >
            ENTER
          </button>
          <button type="button" className="btn-cancel" onClick={() => (window.location.href = 'https://www.google.com')}>
            CANCEL
          </button>
        </div>
      </div>
    </div>
  );
}
