import { useEffect, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { api } from "../lib/api";

export default function BookingPage() {
  const [, params] = useRoute("/book/:roomId");
  const [, navigate] = useLocation();
  const qs = new URLSearchParams(location.search);
  const [room, setRoom] = useState<any>();
  const [purpose, setPurpose] = useState("Group project discussion");
  const [error, setError] = useState("");
  const date = qs.get("date") ?? new Date().toISOString().slice(0, 10);
  const start = qs.get("start") ?? "10:00";
  const end = qs.get("end") ?? "11:00";
  useEffect(() => {
    api(`/rooms/search?start=${encodeURIComponent(new Date(`${date}T${start}`).toISOString())}&end=${encodeURIComponent(new Date(`${date}T${end}`).toISOString())}`)
      .then((data) => setRoom(data.rooms.find((r: any) => r.roomId === params?.roomId)))
      .catch((e) => setError(e.message));
  }, [params?.roomId]);
  const book = async () => {
    if (!room) return;
    try {
      await api("/bookings", { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ roomId: room.roomId, start: new Date(`${date}T${start}`).toISOString(), end: new Date(`${date}T${end}`).toISOString(), purpose }) });
      navigate("/bookings?confirmed=1");
    } catch (e) { setError(e instanceof Error ? e.message : "That room was just taken."); }
  };
  return <div className="booking-page container"><Link href={`/search?date=${date}&start=${start}&end=${end}`} className="back-link">← Back to available rooms</Link><div className="booking-grid"><section><p className="eyebrow">YOUR SPACE FOR THE NEXT {Math.round((new Date(`2000-01-01T${end}`).getTime() - new Date(`2000-01-01T${start}`).getTime()) / 3600000)} HOUR</p><h1>A room for<br />your next idea.</h1>{room ? <div className="feature-room"><div><b>{room.buildingName.toUpperCase()}</b><b>LEVEL 02 ↗</b></div><strong>{room.code.split("-")[1]}</strong><span>{room.type === "study" ? "Group study" : room.type} · {room.capacity} seats · {(room.amenities ?? []).join(" · ")}</span></div> : <div className="feature-room loading-room">Loading room…</div>}<p className="location-note">↳ &nbsp; {room?.buildingName}, second floor.<br />&nbsp;&nbsp;&nbsp;&nbsp;The room number is on the door.</p></section><section className="confirm-panel"><h2>Make it yours.</h2><p className="lede">Check the details before you confirm.<br />We’ll check availability again when you book.</p><dl><dt>Room</dt><dd>{room?.code ?? "—"} · {room?.buildingName ?? "—"}</dd><dt>Date</dt><dd>{new Date(`${date}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</dd><dt>Time</dt><dd>{start}–{end} WAT · 1 hour</dd></dl><label className="purpose">What will you use the room for?<input value={purpose} onChange={(e) => setPurpose(e.target.value)} /></label><div className="info-box">ⓘ &nbsp; This booking is subject to your weekly limit.<br />&nbsp;&nbsp;&nbsp;&nbsp;You can manage or cancel it in My bookings.</div>{error && <div className="error-banner">{error}</div>}<button className="button primary wide" onClick={book}>Confirm booking ↗</button><p className="fine-print">Your room is reserved only after confirmation.</p></section></div></div>;
}
