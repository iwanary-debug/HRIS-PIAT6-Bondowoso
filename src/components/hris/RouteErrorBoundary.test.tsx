import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { RouteErrorBoundary } from "./RouteErrorBoundary";

function Boom(): React.ReactElement {
  throw new Error("Cannot read properties of undefined (reading 'hadir')");
}

describe("RouteErrorBoundary", () => {
  it("renders children when nothing throws", () => {
    render(
      <RouteErrorBoundary pageName="Portal Karyawan">
        <p>Halaman normal</p>
      </RouteErrorBoundary>,
    );
    expect(screen.getByText("Halaman normal")).toBeTruthy();
  });

  it("shows the real error instead of a blank white page", () => {
    // React logs the caught error; silence it so the test output stays readable.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      render(
        <RouteErrorBoundary pageName="Portal Karyawan">
          <Boom />
        </RouteErrorBoundary>,
      );
      expect(screen.getByText(/Halaman ini gagal ditampilkan/)).toBeTruthy();
      expect(screen.getByText(/Portal Karyawan/)).toBeTruthy();
      // The operator needs the actual reason, not just "something went wrong".
      expect(screen.getByText(/reading 'hadir'/)).toBeTruthy();
    } finally {
      spy.mockRestore();
    }
  });
});
