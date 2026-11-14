import React, { useState, useEffect } from 'react';

interface LayoutProps {
  children: React.ReactNode;
  onHomeClick?: () => void;
}

const Layout: React.FC<LayoutProps> = ({ children, onHomeClick }) => {
  const [visitorCount, setVisitorCount] = useState<number | null>(null);

  useEffect(() => {
    // Simulate a visitor count using localStorage
    let count = localStorage.getItem('visitorCount');
    let newCount: number;
    if (count) {
      newCount = parseInt(count, 10) + Math.floor(Math.random() * 5) + 1;
    } else {
      newCount = Math.floor(Math.random() * 1000) + 1500; // Start with a random base
    }
    localStorage.setItem('visitorCount', String(newCount));
    setVisitorCount(newCount);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-800 flex flex-col">
      <header className="bg-gradient-to-r from-blue-600 via-indigo-600 to-indigo-700 text-white shadow-md w-full sticky top-0 z-30">
        <div className="container mx-auto px-4 py-2.5 flex items-center justify-between">
          {/* Logo & Brand Title */}
          <button
            onClick={onHomeClick}
            className="flex items-center gap-2.5 text-left focus:outline-hidden focus:ring-2 focus:ring-white/40 rounded-lg p-1 transition hover:opacity-90 cursor-pointer"
            title="IGCSE Science Helper Home"
          >
            <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center border border-white/20 shadow-xs">
              <svg className="w-5 h-5 text-indigo-100" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-bold tracking-tight text-white leading-tight">
                IGCSE Science Helper
              </h1>
              <p className="text-[10px] text-indigo-200 hidden sm:block tracking-wide">
                2026–2028 Cambridge &bull; Physics &bull; Biology &bull; Chemistry
              </p>
            </div>
          </button>

          <div className="flex items-center gap-3">
            <span className="text-xs bg-white/10 px-2.5 py-1 rounded-full text-indigo-100 border border-white/10 hidden sm:inline-block font-medium">
              Paper 2 Multiple Choice
            </span>
          </div>
        </div>
      </header>

      <main className="flex-grow container mx-auto p-3 sm:p-4 md:p-6 w-full">
        {children}
      </main>

      <footer className="w-full text-center p-4 text-gray-500 text-sm border-t border-gray-200 bg-white">
        <div className="flex flex-col sm:flex-row justify-center items-center space-y-2 sm:space-y-0 sm:space-x-4">
          <p>
            Developed by Mohammed Sarique
          </p>
          {visitorCount !== null && (
            <>
              <span className="hidden sm:inline text-gray-300">|</span>
              <div className="flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 text-indigo-500" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                  <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.022 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                </svg>
                <span>{visitorCount.toLocaleString()} Visitors</span>
              </div>
            </>
          )}
          <span className="hidden sm:inline text-gray-300">|</span>
          <a
            href="https://docs.google.com/forms/d/e/1FAIpQLSeRIKIvWDqOG3PKJptjlhSgnUDObjenE8V6ILvH5Y9wcereCQ/viewform?usp=dialog"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-indigo-600 hover:text-indigo-800 transition-colors inline-flex items-center gap-1"
          >
            <span>Send Feedback</span>
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>
      </footer>
    </div>
  );
};

export default Layout;