import React from 'react';
import { useNavigate } from 'react-router-dom';

const APP_NAME = 'Grainline';

export default function TermsOfService() {
  const navigate = useNavigate();

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', padding: '40px 24px', color: 'var(--ink)' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', background: 'var(--bg-1)', padding: '40px 48px', borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-md)', border: '1px solid var(--border)' }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 30, fontSize: 13, fontWeight: 600 }}>
          <i className="ph ph-arrow-left" /> Back
        </button>
        
        <h1 style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 32, marginBottom: 12 }}>Terms of Service</h1>
        <div style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 32 }}>Last updated: {new Date().toLocaleDateString()}</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, fontSize: 14, lineHeight: 1.6, color: 'var(--ink-2)' }}>
          <p>
            These Terms of Service ("Terms") constitute a legally binding agreement made between you, whether personally or on behalf of an entity ("you") and {APP_NAME} ("we," "us," or "our"), concerning your access to and use of the {APP_NAME} software-as-a-service platform, website, and related services (collectively, the "Service").
          </p>
          <p>
            By accessing or using the Service, you agree that you have read, understood, and agree to be bound by all of these Terms. IF YOU DO NOT AGREE WITH ALL OF THESE TERMS, THEN YOU ARE EXPRESSLY PROHIBITED FROM USING THE SERVICE AND YOU MUST DISCONTINUE USE IMMEDIATELY.
          </p>

          <section>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>1. The Service</h2>
            <p>{APP_NAME} provides a platform designed to help independent fashion brands manage product design, technical packs, vendor sourcing, and production tracking. We act exclusively as a software provider. We are not a manufacturing facility, a sourcing agent, a quality control inspector, or a legal advisor. We do not guarantee the quality, timeline, or legitimacy of any third-party vendor you discover, contact, or contract through our platform.</p>
          </section>

          <section>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>2. User Registration & Security</h2>
            <p>You may be required to register with the Service. You agree to keep your password confidential and will be responsible for all use of your account and password. You must be at least 18 years of age to create an account. If you are using the Service on behalf of a company or organization, you represent that you have the authority to bind that entity to these Terms.</p>
          </section>

          <section>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>3. Subscriptions, Billing, and Cancellation</h2>
            <p><strong>Fees:</strong> Certain aspects of the Service are provided for a fee or other charge. If you elect to use paid aspects of the Service, you agree to the pricing and payment terms presented at the time of checkout. All fees are exclusive of all taxes, levies, or duties imposed by taxing authorities.</p>
            <p><strong>Auto-Renewal:</strong> Subscriptions automatically renew at the end of each billing cycle unless you cancel auto-renewal through your online account management page before the end of the current billing period.</p>
            <p><strong>No Refunds:</strong> You may cancel your subscription at any time; however, there are no refunds for cancellation. In the event that {APP_NAME} suspends or terminates your account or these Terms, you understand and agree that you shall receive no refund or exchange for any unused time on a subscription, any license or subscription fees, or any content or data associated with your account.</p>
          </section>

          <section>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>4. Intellectual Property Rights</h2>
            <p><strong>Your Content:</strong> You retain all ownership rights to the designs, text, images, tech packs, and other data you upload, create, or process within the Service ("User Content"). By using the Service, you grant us a worldwide, non-exclusive, royalty-free license to host, store, and display your User Content strictly as necessary to provide the Service to you.</p>
            <p><strong>Our Content:</strong> Unless otherwise indicated, the Service is our proprietary property and all source code, databases, functionality, software, website designs, audio, video, text, photographs, and graphics on the Service (collectively, the "Content") and the trademarks, service marks, and logos contained therein are owned or controlled by us or licensed to us, and are protected by copyright and trademark laws.</p>
          </section>

          <section>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>5. Artificial Intelligence (AI) Disclaimer</h2>
            <p>The Service utilizes artificial intelligence to generate recommendations, technical specifications, design edits, and cost estimations. You acknowledge that AI technologies are experimental and can produce inaccurate, incomplete, or inappropriate outputs ("Hallucinations").</p>
            <p><strong>You are solely responsible for reviewing, verifying, and validating all AI-generated content (including Bill of Materials, graded measurements, and financial estimates) before relying on them for manufacturing or business decisions. {APP_NAME} shall not be held liable for any manufacturing errors, financial losses, inventory issues, or disputes arising from your reliance on AI-generated outputs.</strong></p>
          </section>

          <section>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>6. Third-Party Integrations</h2>
            <p>The Service may allow you to connect third-party accounts (e.g., Shopify, Instagram, TikTok). Your use of these third-party services is governed by their respective terms of service and privacy policies. {APP_NAME} is not responsible for the availability, accuracy, or reliability of data provided by these third-party integrations.</p>
          </section>

          <section>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>7. Disclaimer of Warranties</h2>
            <p>THE SERVICE IS PROVIDED ON AN AS-IS AND AS-AVAILABLE BASIS. YOU AGREE THAT YOUR USE OF THE SERVICE WILL BE AT YOUR SOLE RISK. TO THE FULLEST EXTENT PERMITTED BY LAW, WE DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, IN CONNECTION WITH THE SERVICE AND YOUR USE THEREOF, INCLUDING, WITHOUT LIMITATION, THE IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.</p>
          </section>

          <section>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>8. Limitation of Liability</h2>
            <p>IN NO EVENT WILL WE OR OUR DIRECTORS, EMPLOYEES, OR AGENTS BE LIABLE TO YOU OR ANY THIRD PARTY FOR ANY DIRECT, INDIRECT, CONSEQUENTIAL, EXEMPLARY, INCIDENTAL, SPECIAL, OR PUNITIVE DAMAGES, INCLUDING LOST PROFIT, LOST REVENUE, LOSS OF DATA, OR OTHER DAMAGES ARISING FROM YOUR USE OF THE SERVICE, EVEN IF WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.</p>
          </section>

          <section>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>9. Indemnification</h2>
            <p>You agree to defend, indemnify, and hold us harmless, including our subsidiaries, affiliates, and all of our respective officers, agents, partners, and employees, from and against any loss, damage, liability, claim, or demand, including reasonable attorneys’ fees and expenses, made by any third party due to or arising out of your use of the Service, breach of these Terms, or your interactions with manufacturers or vendors.</p>
          </section>

          <section>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>10. Governing Law</h2>
            <p>These Terms shall be governed by and defined following the laws of the jurisdiction in which {APP_NAME} is headquartered, without regard to its conflict of law principles.</p>
          </section>

          <section>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>11. Modifications and Interruptions</h2>
            <p>We reserve the right to change, modify, or remove the contents of the Service at any time or for any reason at our sole discretion without notice. We will not be liable to you or any third party for any modification, price change, suspension, or discontinuance of the Service.</p>
          </section>
        </div>
      </div>
    </div>
  );
}