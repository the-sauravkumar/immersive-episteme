import re,sys
def words(p): return re.findall(r"[a-z]+", open(p,encoding='utf-8',errors='ignore').read().lower())
a,b=words(sys.argv[1]),words(sys.argv[2])
def sh(w,n=8): return set(tuple(w[i:i+n]) for i in range(len(w)-n+1))
for n in (5,8,12):
    A,B=sh(a,n),sh(b,n)
    print(f"{n}-word shingles: A {len(A)}, B {len(B)}, shared {len(A&B)}, share of A {len(A&B)/len(A):.1%}, share of B {len(A&B)/len(B):.1%}, Jaccard {len(A&B)/len(A|B):.1%}")
