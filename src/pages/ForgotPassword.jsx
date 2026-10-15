import React from "react";
import { Navigate } from "react-router-dom";

export default function ForgotPassword() {
  return <Navigate to="/login" replace />;
}
