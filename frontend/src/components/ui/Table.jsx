import React from 'react';

export function Table({ children, className = '', ...props }) {
  return (
    <div className="data-table-wrap">
      <table className={`data-table ${className}`.trim()} {...props}>
        {children}
      </table>
    </div>
  );
}

export function TableHead({ children, className = '', ...props }) {
  return (
    <thead className={className} {...props}>
      {children}
    </thead>
  );
}

export function TableBody({ children, className = '', ...props }) {
  return (
    <tbody className={className} {...props}>
      {children}
    </tbody>
  );
}

export function TableRow({ children, className = '', ...props }) {
  return (
    <tr className={className} {...props}>
      {children}
    </tr>
  );
}

export function TableHeader({ children, className = '', numeric = false, ...props }) {
  return (
    <th className={`${numeric ? 'numeric' : ''} ${className}`.trim()} {...props}>
      {children}
    </th>
  );
}

export function TableCell({ children, className = '', numeric = false, ...props }) {
  return (
    <td className={`${numeric ? 'numeric tabular-nums' : ''} ${className}`.trim()} {...props}>
      {children}
    </td>
  );
}

export default Table;
