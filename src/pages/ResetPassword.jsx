import React from "react";
import { Navigate } from "react-router-dom";

export default function ResetPassword() {
  return <Navigate to="/login" replace />;
}
