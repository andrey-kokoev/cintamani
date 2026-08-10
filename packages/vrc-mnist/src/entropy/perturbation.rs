use super::modes::StateOperator;
pub fn l2(a: &[f64], b: &[f64]) -> f64 {
    a.iter()
        .zip(b)
        .map(|(x, y)| (x - y) * (x - y))
        .sum::<f64>()
        .sqrt()
}
pub fn norm(a: &[f64]) -> f64 {
    a.iter().map(|x| x * x).sum::<f64>().sqrt()
}
pub fn evolve(op: &dyn StateOperator, mut state: Vec<f64>, input: &[f64], t: usize) -> Vec<f64> {
    for _ in 0..t {
        state = op.step(&state, input)
    }
    state
}
pub fn quantized_key(state: &[f64], tolerance: f64) -> Vec<i64> {
    state
        .iter()
        .take(16)
        .map(|x| (x / tolerance).round() as i64)
        .collect()
}
