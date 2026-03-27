import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import AppHeader from './AppHeader';
import BottomNav from './BottomNav';
import { useStore } from '@/store/useStore';

const AppLayout = () => {
  const location = useLocation();
  const processAjoAutoPayments = useStore((state) => state.processAjoAutoPayments);

  useEffect(() => {
    processAjoAutoPayments();
    const timer = window.setInterval(() => {
      processAjoAutoPayments();
    }, 60 * 1000);

    return () => window.clearInterval(timer);
  }, [processAjoAutoPayments]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-background max-w-5xl mx-auto relative">
      <AppHeader />
      <main className="pb-24 px-4">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
};

export default AppLayout;
