/**
 * AI Chat Page - Placeholder
 * This feature requires a separate AI backend
 */

const AIChat = () => {
  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <div className="container-default py-8 lg:py-12">
        <div className="max-w-2xl mx-auto text-center">
          <div className="w-20 h-20 rounded-2xl bg-[var(--color-primary)]/10 flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-[var(--color-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-[var(--color-text-primary)] mb-4">
            AI Assistant
          </h1>
          <p className="text-[var(--color-text-secondary)] mb-8">
            This feature is coming soon. The AI assistant will help you with file organization and smart sharing suggestions.
          </p>
          <a
            href="/transfer"
            className="btn btn-primary inline-flex"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            Go to File Transfer
          </a>
        </div>
      </div>
    </div>
  );
};

export default AIChat;
