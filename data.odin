package main

Production :: struct {
    id:          int,
    title:       string,
    description: string,
    date:        string,
    status:      string,
}

News :: struct {
    id:      int,
    title:   string,
    content: string,
    date:    string,
}

// Sample data stored in memory
PRODUCTIONS := [?]Production{
    {1, "Carmen", "Bizet's passionate tale of love and jealousy set in 19th-century Spain. Our production brings new energy to this beloved classic.", "2024-06-15", "upcoming"},
    {2, "The Magic Flute", "Mozart's enchanting fairy tale opera featuring spectacular staging and costumes. A perfect introduction to opera for newcomers.", "2024-08-20", "upcoming"},
    {3, "La Traviata", "Verdi's heart-wrenching story of Violetta and Alfredo. Our intimate production highlights the emotional depth of this masterpiece.", "2024-03-10", "past"},
}

NEWS := [?]News{
    {1, "Auditions Open for Carmen", "We are excited to announce that auditions for our upcoming production of Carmen are now open. We are looking for passionate singers to join our cast.", "2024-02-15"},
    {2, "New Rehearsal Space", "Thanks to generous community support, we have secured a new rehearsal space that will enhance our preparation process.", "2024-02-01"},
    {3, "Season Announcement", "We are thrilled to announce our upcoming season featuring three amazing productions that showcase the best of opera.", "2024-01-15"},
}

get_productions :: proc() -> []Production {
    return PRODUCTIONS[:]
}

get_news :: proc() -> []News {
    return NEWS[:]
}
