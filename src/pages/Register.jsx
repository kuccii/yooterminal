import React from "react";
import { Navigate } from "react-router-dom";
import { safeReturnTo } from "@/lib/authReturnTo";

export default function Register() {
  return <Navigate to={`/login?returnTo=${encodeURIComponent(safeReturnTo())}`} replace />;
}
