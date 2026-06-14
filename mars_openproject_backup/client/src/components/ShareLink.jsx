import React, { useState, useEffect } from 'react';
import { Copy, Check } from 'lucide-react';
import QRCode from 'qrcode';

export default function ShareLink({ roomId, encryptionKey }) {
  const [copied, setCopied] = useState(false);
  const [qrCodeData, setQrCodeData] = useState('');

  const shareUrl = `${window.location.origin}/room/${roomId}#key=${encryptionKey}`;

  useEffect(() => {
    QRCode.toDataURL(shareUrl, { width: 160, margin: 1, color: { dark: '#000000FF', light: '#FFFFFFFF' } })
      .then(url => setQrCodeData(url))
      .catch(err => console.error(err));
  }, [shareUrl]);

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="glass-panel p-6 w-full flex flex-col items-center gap-4 text-center mt-8">
      <h3 className="text-xl font-bold">Share this link to start transfer</h3>
      <p className="text-sm text-gray-400">The file never touches our servers. The encryption key is only shared via this link.</p>
      
      {qrCodeData && (
        <div className="bg-white p-2 rounded-xl mt-2 mb-2">
          <img src={qrCodeData} alt="Share QR Code" width={160} height={160} />
        </div>
      )}

      <div className="flex items-center w-full max-w-md gap-2 mt-2">
        <input 
          type="text" 
          value={shareUrl} 
          readOnly 
          className="flex-1 glass p-3 rounded-lg code-font text-sm text-gray-300 outline-none"
          style={{ background: 'rgba(0,0,0,0.2)' }}
        />
        <button onClick={handleCopy} className="btn btn-primary" style={{ padding: '12px' }}>
          {copied ? <Check size={20} /> : <Copy size={20} />}
        </button>
      </div>
    </div>
  );
}
