// DRAFT ONLY - this is placeholder privacy/terms language generated during development. It has NOT been reviewed by a lawyer and must not be treated as a finished, legally binding document. Get actual legal review before relying on this for real users.

function PrivacyNotice() {
  return (
    <section className="coming-soon privacy-notice-page">
      <p className="eyebrow">PRIVACY NOTICE</p>
      <h1>Privacy Notice</h1>
      <p>
        Screenshots uploaded through the Screenshot Trade Workflow are stored in a private bucket and linked to the associated journal trade. When you use screenshot extraction or ask Coach to analyze a saved screenshot, the selected image is sent to OpenAI for analysis. Screenshot paths and image data are not saved in Coach conversation history.
      </p>
      <p>TradingView provides the chart, ticker, economic calendar, news timeline, and technical-analysis widgets. These widgets load TradingView scripts and receive display settings and selected symbols; no journal trades, notes, or other journal records are sent to them.</p>
      <p>News headlines and summaries are obtained from third-party news providers. When you request an explanation, only the headline and provider summary are sent to OpenAI; full article text and journal data are not included.</p>
      <p>Requested market symbols and timeframes are sent through the app's backend to Massive to retrieve historical market bars. No journal data is sent with market-data requests.</p>
      <p>
        This privacy notice is a development draft and requires legal review before production use. A Settings-level opt-out for screenshot storage is not available yet.
      </p>
    </section>
  );
}

export default PrivacyNotice;
