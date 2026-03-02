export default function Page({ params }: { params: { companyId: string } }) {
  return (
    <div style={{ padding: 24 }}>
      <h2>Super Admin – Company Detail</h2>
      <p>
        Company ID: <b>{params.companyId}</b>
      </p>

      <div style={{ marginTop: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button type="button">Start Service</button>
        <button type="button">Stop Service</button>
        <button type="button">Set Grace (7 days)</button>
      </div>

      <div style={{ marginTop: 20 }}>
        <a href={`/super/companies/${params.companyId}/employees`}>
          View Employees →
        </a>
      </div>
    </div>
  );
}
