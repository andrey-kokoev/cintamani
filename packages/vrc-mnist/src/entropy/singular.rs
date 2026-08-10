use super::modes::StateOperator;
use rand::{Rng, SeedableRng, rngs::StdRng};

fn norm(x: &[f64]) -> f64 {
    x.iter().map(|v| v * v).sum::<f64>().sqrt()
}
fn dot(a: &[f64], b: &[f64]) -> f64 {
    a.iter().zip(b).map(|(x, y)| x * y).sum()
}
pub fn normalized_probe(n: usize, seed: u64) -> Vec<f64> {
    let mut rng = StdRng::seed_from_u64(seed);
    let mut x: Vec<f64> = (0..n).map(|_| rng.random_range(-1.0..1.0)).collect();
    let d = norm(&x).max(f64::EPSILON);
    x.iter_mut().for_each(|v| *v /= d);
    x
}
pub fn jvp(
    op: &dyn StateOperator,
    state: &[f64],
    input: &[f64],
    direction: &[f64],
    eps: f64,
) -> Vec<f64> {
    let plus: Vec<_> = state
        .iter()
        .zip(direction)
        .map(|(x, d)| x + eps * d)
        .collect();
    let minus: Vec<_> = state
        .iter()
        .zip(direction)
        .map(|(x, d)| x - eps * d)
        .collect();
    op.step(&plus, input)
        .iter()
        .zip(op.step(&minus, input))
        .map(|(a, b)| (a - b) / (2.0 * eps))
        .collect()
}
/// Matrix-free VJP obtained by differentiating a scalar output projection. A
/// physical adapter may replace this with reciprocal/adjoint measurements.
pub fn vjp(
    op: &dyn StateOperator,
    state: &[f64],
    input: &[f64],
    cotangent: &[f64],
    eps: f64,
) -> Vec<f64> {
    if let Some(value) = op.analytic_vjp(cotangent) {
        return value;
    }
    (0..op.dimension())
        .map(|i| {
            let mut plus = state.to_vec();
            let mut minus = state.to_vec();
            plus[i] += eps;
            minus[i] -= eps;
            (dot(&op.step(&plus, input), cotangent) - dot(&op.step(&minus, input), cotangent))
                / (2.0 * eps)
        })
        .collect()
}
fn orthogonalize(mut v: Vec<f64>, basis: &[Vec<f64>]) -> Vec<f64> {
    for q in basis {
        let p = dot(&v, q);
        for (i, x) in v.iter_mut().enumerate() {
            *x -= p * q[i]
        }
    }
    let d = norm(&v);
    if d > 1e-14 {
        v.iter_mut().for_each(|x| *x /= d)
    }
    v
}
/// Randomized matrix-free singular spectrum via deflated power iteration on
/// J^T J. No transmission matrix or Jacobian is materialized.
pub fn spectrum(
    op: &dyn StateOperator,
    state: &[f64],
    input: &[f64],
    probes: usize,
    eps: f64,
    seed: u64,
) -> Vec<f64> {
    let mut basis: Vec<Vec<f64>> = Vec::new();
    let mut values = Vec::new();
    for i in 0..probes.min(op.dimension()) {
        let mut v = orthogonalize(normalized_probe(op.dimension(), seed + i as u64), &basis);
        for _ in 0..12 {
            let y = jvp(op, state, input, &v, eps);
            v = orthogonalize(vjp(op, state, input, &y, eps), &basis);
            if norm(&v) < 1e-12 {
                break;
            }
        }
        let sigma = norm(&jvp(op, state, input, &v, eps));
        if sigma > 1e-12 {
            basis.push(v)
        }
        values.push(sigma);
    }
    values.sort_by(|a, b| b.total_cmp(a));
    values
}
pub fn effective_rank_threshold(s: &[f64], threshold: f64) -> f64 {
    let filtered: Vec<f64> = s.iter().copied().filter(|x| *x > threshold).collect();
    let s = &filtered;
    let sum: f64 = s.iter().sum();
    if sum <= f64::EPSILON {
        return 0.0;
    }
    let h: f64 = s
        .iter()
        .filter(|x| **x > 0.0)
        .map(|x| {
            let p = x / sum;
            -p * p.ln()
        })
        .sum();
    h.exp()
}
pub fn effective_rank(s: &[f64]) -> f64 {
    effective_rank_threshold(s, 1e-12)
}
