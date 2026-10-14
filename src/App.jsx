import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';
import Layout from '@/components/Layout';
import Home from '@/pages/Home';
import SearchResults from '@/pages/SearchResults';
import TripDetail from '@/pages/TripDetail';
import Checkout from '@/pages/Checkout';
import BookingConfirmation from '@/pages/BookingConfirmation';
import MyTrips from '@/pages/MyTrips';
import RoutePage from '@/pages/RoutePage';
import CityPage from '@/pages/CityPage';
import Places from '@/pages/Places';
import OperatorPage from '@/pages/OperatorPage';
import Help from '@/pages/Help';
import OperatorDashboard from '@/pages/OperatorDashboard';
import AdminPanel from '@/pages/AdminPanel';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/search" element={<SearchResults />} />
        <Route path="/trip/:tripKey" element={<TripDetail />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/booking/:ref" element={<BookingConfirmation />} />
        <Route path="/routes/:slug" element={<RoutePage />} />
        <Route path="/city/:slug" element={<CityPage />} />
        <Route path="/places" element={<Places />} />
        <Route path="/operator/:slug" element={<OperatorPage />} />
        <Route path="/help" element={<Help />} />
        <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
          <Route path="/trips" element={<MyTrips />} />
          <Route path="/operator" element={<OperatorDashboard />} />
          <Route path="/admin" element={<AdminPanel />} />
        </Route>
      </Route>

      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {

  // Router must wrap AuthProvider — it calls useNavigate()/useLocation().
  return (
    <Router>
      <AuthProvider>
        <QueryClientProvider client={queryClientInstance}>
          <ScrollToTop />
          <AuthenticatedApp />
          <Toaster />
        </QueryClientProvider>
      </AuthProvider>
    </Router>
  )
}

export default App