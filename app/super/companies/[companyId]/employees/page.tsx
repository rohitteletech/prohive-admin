export default function Page({ params }: { params: { companyId: string } }) {
  const rows = [
    {
      emp_code: "E001",
      mobile: "98XXXXXX12",
      status: "active",
      device_model: "Samsung M21",
      android_version: "12",
      device_id: "dev_abc_123",
      bound_at: "2026-02-10 10:15",
      last_punch: "(later)",
    },
    {
      emp_code: "E002",
      mobile: "99XXXXXX34",
      status: "disabled",
      device_model: "Realme 21",
      android_version: "13",
      device_id: "dev_xyz_789",
      bound_at: "2026-02-09 18:40",
      last_punch: "(later)",
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <h2>Super Admin – Company Employees</h2>
      <p>
        Company ID: <b>{params.companyId}</b>
      </p>

      <div style={{ overflowX: "auto", marginTop: 16 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {[
                "Employee Code",
                "Mobile",
                "Employee Status",
                "Device Model",
                "Android Version",
                "Device ID",
                "Bound At",
                "Last Punch",
                "Actions",
              ].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid #ddd",
                    padding: 10,
                    whiteSpace: "nowrap",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map((r) => (
              <tr key={r.emp_code}>
                <td style={{ padding: 10, borderBottom: "1px solid #f0f0f0" }}>
                  {r.emp_code}
                </td>
                <td style={{ padding: 10, borderBottom: "1px solid #f0f0f0" }}>
                  {r.mobile}
                </td>
                <td style={{ padding: 10, borderBottom: "1px solid #f0f0f0" }}>
                  {r.status}
                </td>
                <td style={{ padding: 10, borderBottom: "1px solid #f0f0f0" }}>
                  {r.device_model}
                </td>
                <td style={{ padding: 10, borderBottom: "1px solid #f0f0f0" }}>
                  {r.android_version}
                </td>
                <td style={{ padding: 10, borderBottom: "1px solid #f0f0f0" }}>
                  {r.device_id}
                </td>
                <td style={{ padding: 10, borderBottom: "1px solid #f0f0f0" }}>
                  {r.bound_at}
                </td>
                <td style={{ padding: 10, borderBottom: "1px solid #f0f0f0" }}>
                  {r.last_punch}
                </td>
                <td style={{ padding: 10, borderBottom: "1px solid #f0f0f0" }}>
                  <a href="#">View</a>{" "}
                  <span style={{ margin: "0 8px" }}>|</span>{" "}
                  <a href="#">Force Reset</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 16 }}>
        <a href={`/super/companies/${params.companyId}`}>← Back to Company</a>
      </div>
    </div>
  );
}
