/**
 * ONE Command Center — App Shell
 *
 * Primary screen: /authorize (minimal authorization surface)
 * Login redirects to /authorize after authentication.
 *
 * ONE is an untrusted client. All enforcement happens in the Gateway.
 */
import { Route, Switch, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { Toaster } from "@/components/ui/sonner";
import Login from "@/pages/Login";
import Authorize from "@/pages/Authorize";
import NewIntent from "@/pages/NewIntent";
import GatewayApprovals from "@/pages/GatewayApprovals";
import Receipts from "@/pages/Receipts";
import Ledger from "@/pages/Ledger";
import Status from "@/pages/Status";
import SystemArchitecture from "@/pages/SystemArchitecture";
import GovernanceDashboard from "@/pages/GovernanceDashboard";
import AskBondi from "@/pages/AskBondi";
import EmailFirewall from "@/pages/EmailFirewall";
import RIODashboard from "@/pages/RIODashboard";
import SendAction from "@/pages/SendAction";

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark" switchable>
        <Switch>
          <Route path="/" component={Login} />
          <Route path="/authorize" component={Authorize} />
          <Route path="/dashboard" component={GovernanceDashboard} />
          <Route path="/intent/new" component={NewIntent} />
          <Route path="/approvals" component={GatewayApprovals} />
          <Route path="/receipts" component={Receipts} />
          <Route path="/ledger" component={Ledger} />
          <Route path="/status" component={Status} />
          <Route path="/architecture" component={SystemArchitecture} />
          <Route path="/ask-bondi" component={AskBondi} />
          <Route path="/email-firewall" component={EmailFirewall} />
          <Route path="/rio" component={RIODashboard} />
          <Route path="/send" component={SendAction} />
          {/* Catch-all: redirect to login */}
          <Route>
            <Redirect to="/" />
          </Route>
        </Switch>
        <Toaster position="top-center" richColors />
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
