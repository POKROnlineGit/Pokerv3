export default function LicensesPage() {
  return (
    <div
      className="container mx-auto p-6 max-w-4xl relative z-50"
      style={{ color: "white" }}
    >
      <h1 className="text-3xl font-bold mb-6">Third-Party Licenses</h1>

      <div className="space-y-8">
        <p>
          This page contains the licenses for third-party libraries and
          dependencies used in this project.
        </p>

        <div className="space-y-4">
          <div
            className="border-b pb-4"
            style={{ borderColor: "rgba(255, 255, 255, 0.2)" }}
          >
            <h2 className="text-xl font-semibold mb-2">MIT License</h2>
            <p className="text-sm mb-2">
              Copyright (c) 2018 Howard Yeh (
              <a
                href="https://github.com/hayeah"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#60a5fa", textDecoration: "underline" }}
              >
                https://github.com/hayeah
              </a>
              )
            </p>
            <pre
              className="text-xs bg-black/50 p-4 rounded overflow-auto whitespace-pre-wrap"
              style={{ color: "white" }}
            >
              {`Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`}
            </pre>
          </div>

          <div
            className="border-b pb-4"
            style={{ borderColor: "rgba(255, 255, 255, 0.2)" }}
          >
            <h2 className="text-xl font-semibold mb-2">
              Creative Commons Attribution 3.0 (CC BY 3.0)
            </h2>
            <p className="text-sm mb-2">
              Suit symbol icons used in simplified card designs.
            </p>
            <p className="text-sm mb-2">
              Icons made by game-icons.net. Available on{" "}
              <a
                href="https://game-icons.net"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#60a5fa", textDecoration: "underline" }}
              >
                https://game-icons.net
              </a>
            </p>
            <p className="text-sm mb-2">
              This work is licensed under the{" "}
              <a
                href="https://creativecommons.org/licenses/by/3.0/"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#60a5fa", textDecoration: "underline" }}
              >
                Creative Commons Attribution 3.0 Unported License
              </a>
              .
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

