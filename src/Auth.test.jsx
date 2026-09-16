import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import Auth from "./Auth";

const { signInWithPassword } = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
}));

vi.mock("./supabaseClient", () => ({
  supabase: {
    auth: {
      signInWithPassword,
      signUp: vi.fn(),
    },
  },
}));

describe("Auth", () => {
  beforeEach(() => {
    signInWithPassword.mockReset();
  });

  it("renders the login form fields", () => {
    render(<Auth />);

    expect(screen.getByRole("heading", { name: "Sign in to your account" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign In" })).toBeInTheDocument();
  });

  it("shows client-side validation and does not call Supabase when credentials are empty", () => {
    render(<Auth />);

    fireEvent.submit(screen.getByRole("button", { name: "Sign In" }).closest("form"));

    expect(screen.getByText("Please enter your email and password.")).toBeInTheDocument();
    expect(signInWithPassword).not.toHaveBeenCalled();
  });
});