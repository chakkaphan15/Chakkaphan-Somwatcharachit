import React from 'react';
import TopNav from './TopNav';

const Layout = ({ title, children, hideHeader, className }) => {
  return (
    <div className={`layout-wrapper${className ? ` ${className}` : ''}`}>
      <TopNav />
      <div className="main-content">
        {!hideHeader && (
          <div className="page-header">
            <div className="page-title">{title || 'แดชบอร์ด'}</div>
          </div>
        )}
        <div className="content-area">
          {children}
        </div>
      </div>
    </div>
  );
};

export default Layout;