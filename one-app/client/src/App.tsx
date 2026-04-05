/**
 * ONE Command Center — App Shell
 *
 * Screens:
 * 1. Login (/)
 * 2. Create Intent (/intent/new)
 * 3. Approvals (/approvals)
 * 4. Receipts (/receipts)
 * 5. Ledger (/ledger)
 * 6. Status (/status)
 *
 * ONE is an untrusted client. All enforcement happens in the Gateway.
 */
import { Route, Switch, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { Toaster } from "@/components/ui/sonner";
import Login from "@/pages/Login";
import NewIntent from "@/pages/NewIntent";
import GatewayApprovals from "@/pages/GatewayApprovals";
import Receipts from "@/pages/Receipts";
import Ledger from "@/pages/Ledger";
import Status from "@/pages/Status";

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark" switchable>
        <Switch>
          <Route path="/" component={Login} />
          <Route path="/intent/new" component={NewIntent} />
          <Route path="/approvals" component={GatewayApprovals} />
          <Route path="/receipts" component={Receipts} />
          <Route path="/ledger" component={Ledger} />
          <Route path="/status" component={Status} />
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
