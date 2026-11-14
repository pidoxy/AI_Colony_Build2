import { useEffect, useState } from "react";
import { Link, Route, Switch, useLocation } from "wouter";
import Home from "./pages/Home";
import SearchPage from "./pages/SearchPage";
import BookingPage from "./pages/BookingPage";
import BookingsPage from "./pages/BookingsPage";
import { api } from "./lib/api";
import "./styles.css";

export function Header() {
  const [location] = useLocation();
  const appPage = location.startsWith("/search") || location.startsWith("/bookings") || location.startsWith("/book/");
  return <header className="site-header">
    <Link href="/" className="brand"><span className="brand-mark">↗</span><strong>campus</strong> <span>rooms</span></Link>
    {appPage ? <nav className="app-nav"><Link className={location.startsWith("/search") || location.startsWith("/book/") ? "active" : ""} href="/search">Find a room</Link><Link className={location.startsWith("/bookings") ? "active" : ""} href="/bookings">My bookings</Link></nav> : <nav className="marketing-nav"><a href="#spaces">Spaces</a><a href="#how">How it works</a><a href="#good">Good to know</a><Link href="/bookings">My bookings</Link><Link href="/search" className="button primary">Find a room ↗</Link></nav>}
    <div className="campus">Main campus · WAT <span className="avatar">AO</span></div>
  </header>;
}

export default function App() {
  useEffect(() => { if (!localStorage.getItem("crs_token")) localStorage.setItem("crs_token", JSON.stringify({ student: { sub: "s123" } })); }, []);
  return <><Header /><main><Switch><Route path="/" component={Home} /><Route path="/search" component={SearchPage} /><Route path="/book/:roomId" component={BookingPage} /><Route path="/bookings" component={BookingsPage} /><Route><div className="empty-page"><h1>Page not found.</h1><Link href="/">Back home</Link></div></Route></Switch></main></>;
}

export { api };
