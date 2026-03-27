import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Demo1 from "./pages/Demo1";
import Demo2 from "./pages/Demo2";
import Demo3 from "./pages/Demo3";
import HowItWorks from "./pages/HowItWorks";
import Architecture from "./pages/Architecture";
import UseCases from "./pages/UseCases";
import Docs from "./pages/Docs";
import Demo4 from "./pages/Demo4";
import Whitepaper from "./pages/Whitepaper";
import FAQ from "./pages/FAQ";
import GetStarted from "./pages/GetStarted";
import VerifyReceipt from "./pages/VerifyReceipt";
import LedgerExplorer from "./pages/LedgerExplorer";
import TamperDemo from "./pages/TamperDemo";
import Demo5 from "./pages/Demo5";
import PositionPaper from "./pages/PositionPaper";
import Contact from "./pages/Contact";
import Roadmap from "./pages/Roadmap";

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/how-it-works"} component={HowItWorks} />
      <Route path={"/architecture"} component={Architecture} />
      <Route path={"/use-cases"} component={UseCases} />
      <Route path={"/docs"} component={Docs} />
      <Route path={"/demo1"} component={Demo1} />
      <Route path={"/demo2"} component={Demo2} />
      <Route path={"/demo3"} component={Demo3} />
      <Route path={"/demo4"} component={Demo4} />
      <Route path={"/faq"} component={FAQ} />
      <Route path={"/get-started"} component={GetStarted} />
      <Route path={"/whitepaper"} component={Whitepaper} />
      <Route path={"/verify"} component={VerifyReceipt} />
      <Route path={"/ledger"} component={LedgerExplorer} />
      <Route path={"/tamper"} component={TamperDemo} />
      <Route path={"/demo5"} component={Demo5} />
      <Route path={"/position-paper"} component={PositionPaper} />
      <Route path={"/contact"} component={Contact} />
      <Route path={"/roadmap"} component={Roadmap} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
