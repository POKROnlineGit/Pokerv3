'use client'

export default function LicensesPage() {
  return (
    <div className="container mx-auto p-6 max-w-4xl relative z-10">
      <h1 className="text-3xl font-bold mb-6 text-foreground">Third-Party Licenses</h1>
      
      <div className="space-y-8">
        <p className="text-muted-foreground">
          This page contains the licenses for third-party libraries and dependencies used in this project.
        </p>

        <div className="space-y-4">
          <div className="border-b pb-4 border-border">
            <h2 className="text-xl font-semibold mb-2 text-foreground">MIT License</h2>
            <p className="text-sm text-muted-foreground mb-2">
              Copyright (c) 2018 Howard Yeh (
              <a
                href="https://github.com/hayeah"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                https://github.com/hayeah
              </a>
              )
            </p>
            <pre className="text-xs bg-muted text-foreground p-4 rounded overflow-auto whitespace-pre-wrap">
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
        </div>
      </div>
    </div>
  );
}

