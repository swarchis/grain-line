import React from 'react';
import { useNavigate } from 'react-router-dom';

const APP_NAME = 'Atelier';
const CONTACT_EMAIL = 'support@atelier.com'; // Change this when you have a custom domain

export default function PrivacyPolicy() {
  const navigate = useNavigate();

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', padding: '40px 24px', color: 'var(--ink)' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', background: 'var(--bg-1)', padding: '40px 48px', borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-md)', border: '1px solid var(--border)' }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 30, fontSize: 13, fontWeight: 600 }}>
          <i className="ph ph-arrow-left" /> Back
        </button>
        
        <h1 style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 32, marginBottom: 12 }}>Privacy Policy</h1>
        <div style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 32 }}>Last updated: {new Date().toLocaleDateString()}</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, fontSize: 14, lineHeight: 1.6, color: 'var(--ink-2)' }}>
          <p>
            Welcome to {APP_NAME} ("we," "our," or "us"). We are committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website, use our application, or interact with our services (collectively, the "Service"). Please read this Privacy Policy carefully. If you do not agree with the terms of this Privacy Policy, please do not access the Service.
          </p>

          <section>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>1. Information We Collect</h2>
            <p>We may collect information about you in a variety of ways. The information we may collect via the Service includes:</p>
            <ul style={{ paddingLeft: 20, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <li><strong>Personal Data:</strong> Personally identifiable information, such as your name, email address, and demographic information, that you voluntarily give to us when you register with the Service or when you choose to participate in various activities related to the Service.</li>
              <li><strong>Business & Production Data:</strong> Data related to your brand, including product designs, technical packs, supplier relationships, financial estimates, and production timelines.</li>
              <li><strong>Financial Data:</strong> Financial information, such as data related to your payment method (e.g., valid credit card number, card brand, expiration date) that we may collect when you purchase, order, return, exchange, or request information about our services. All financial data is stored by our payment processor, Stripe. We do not store full credit card details on our servers.</li>
              <li><strong>Derivative Data & Integrations:</strong> Information our servers automatically collect when you access the Service, such as your IP address, your browser type, your operating system, your access times, and the pages you have viewed directly before and after accessing the Service. If you connect third-party platforms (e.g., Shopify, Instagram, TikTok), we collect access tokens and read-only data necessary to provide integration features.</li>
            </ul>
          </section>

          <section>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>2. Use of Your Information</h2>
            <p>Having accurate information about you permits us to provide you with a smooth, efficient, and customized experience. Specifically, we may use information collected about you via the Service to:</p>
            <ul style={{ paddingLeft: 20, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <li>Create and manage your account.</li>
              <li>Process your transactions and send you related information, including purchase confirmations and invoices.</li>
              <li>Provide, operate, and maintain the Service, including AI-driven tech pack generation, cost estimations, and inventory risk assessments.</li>
              <li>Improve, personalize, and expand our Service.</li>
              <li>Communicate with you, either directly or through one of our partners, including for customer service, to provide you with updates and other information relating to the Service.</li>
              <li>Send you emails regarding your account, teammates, or orders.</li>
            </ul>
          </section>

          <section>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>3. Artificial Intelligence (AI) and Third Parties</h2>
            <p>{APP_NAME} utilizes third-party artificial intelligence services, including Google Gemini and Pixazo, to provide core platform features. By using the Service, you acknowledge and agree that:</p>
            <ul style={{ paddingLeft: 20, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <li>Relevant data inputs (such as text descriptions, garment sketches, and material lists) are securely transmitted to these third-party AI providers for processing.</li>
              <li><strong>We do not use your private designs, tech packs, or brand data to train our own proprietary base models.</strong></li>
              <li>We only share the minimum amount of data necessary to execute the specific AI function requested by you.</li>
            </ul>
          </section>

          <section>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>4. Disclosure of Your Information</h2>
            <p>We may share information we have collected about you in certain situations. Your information may be disclosed as follows:</p>
            <ul style={{ paddingLeft: 20, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <li><strong>By Law or to Protect Rights:</strong> If we believe the release of information about you is necessary to respond to legal process, to investigate or remedy potential violations of our policies, or to protect the rights, property, and safety of others, we may share your information as permitted or required by any applicable law, rule, or regulation.</li>
              <li><strong>Third-Party Service Providers:</strong> We may share your information with third parties that perform services for us or on our behalf, including payment processing, data analysis, email delivery, hosting services, customer service, and marketing assistance.</li>
              <li><strong>Business Transfers:</strong> We may share or transfer your information in connection with, or during negotiations of, any merger, sale of company assets, financing, or acquisition of all or a portion of our business to another company.</li>
            </ul>
          </section>

          <section>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>5. Security of Your Information</h2>
            <p>We use administrative, technical, and physical security measures (including Row Level Security databases) to help protect your personal information. While we have taken reasonable steps to secure the personal information you provide to us, please be aware that despite our efforts, no security measures are perfect or impenetrable, and no method of data transmission can be guaranteed against any interception or other type of misuse.</p>
          </section>

          <section>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>6. Your Privacy Rights (GDPR & CCPA)</h2>
            <p>Depending on your location, you may have certain rights regarding your personal information, including the right to:</p>
            <ul style={{ paddingLeft: 20, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <li>Request access to the personal data we hold about you.</li>
              <li>Request that we correct any inaccuracies in your personal data.</li>
              <li>Request the deletion of your personal data.</li>
              <li>Object to or restrict the processing of your personal data.</li>
              <li>Request the transfer of your personal data to another party.</li>
            </ul>
            <p style={{ marginTop: 8 }}>To exercise any of these rights, please contact us using the information provided below. We will respond to your request within the timeframe required by applicable law.</p>
          </section>

          <section>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>7. Contact Us</h2>
            <p>If you have questions or comments about this Privacy Policy, please contact us at:</p>
            <p style={{ marginTop: 8 }}><strong>Email:</strong> <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></p>
          </section>
        </div>
      </div>
    </div>
  );
}