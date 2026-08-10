//! Training orchestration remains independent of the physical model and backend.
//! Recurrence counts are selected deterministically from the committed configuration using
//! `(seed + epoch + batch_index) % train_recurrences.len()`.

pub fn recurrence_for_batch(choices: &[usize], seed: u64, epoch: usize, batch: usize) -> usize {
    choices[(seed as usize).wrapping_add(epoch).wrapping_add(batch) % choices.len()]
}
